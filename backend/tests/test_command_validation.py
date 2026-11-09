"""Command validation: what may be queued, and what a device may report back."""

import pytest

HW_ID = "test-hw-commands"
REGISTER = {"hardware_id": HW_ID, "device_type": "climate_controller", "name": "Cmd test"}


@pytest.fixture
def device_id(internal_client, device_key):
    response = internal_client.post(
        "/api/v1/device/register", json=REGISTER, headers={"X-Device-Key": device_key}
    )
    assert response.status_code == 200
    return response.json()["id"]


def _create(client, device_id, body):
    return client.post(f"/api/v1/management/devices/{device_id}/commands", json=body)


# --- Creating commands --------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {"power": True},
        {"power": False},
        {"target_temperature": 16},
        {"target_temperature": 30},
        {"power": True, "target_temperature": 23},
        {"power": None, "target_temperature": 23},
    ],
)
def test_valid_payloads_are_accepted(internal_client, device_id, payload):
    response = _create(internal_client, device_id, {"payload": payload})
    assert response.status_code == 201
    assert response.json()["type"] == "set_state"


@pytest.mark.parametrize(
    "payload",
    [
        {},  # nothing to set
        {"power": None, "target_temperature": None},
        {"target_temperature": 15},  # below the AC's range
        {"target_temperature": 31},  # above it
        {"target_temperature": 10},
        {"target_temperature": 32},
        {"target_temperature": -1},
        {"target_temperature": 0},
        {"target_temperature": 22.5},  # fractional
        {"target_temperature": 22.0},  # float, even if whole
        {"target_temperature": "22"},  # string
        {"target_temperature": True},  # bool is not a temperature
        {"power": "yes"},
        {"power": 1},
        {"power": "true"},
        {"power": True, "mode": "cool"},  # unknown key
        {"power": True, "target_temperature": 99},  # one bad field poisons it
    ],
)
def test_invalid_payloads_are_rejected(internal_client, device_id, payload):
    assert _create(internal_client, device_id, {"payload": payload}).status_code == 422


@pytest.mark.parametrize("command_type", ["reboot", "", "SET_STATE", None, 1])
def test_unsupported_command_types_are_rejected(internal_client, device_id, command_type):
    body = {"type": command_type, "payload": {"power": True}}
    assert _create(internal_client, device_id, body).status_code == 422


def test_unknown_top_level_field_is_rejected(internal_client, device_id):
    body = {"payload": {"power": True}, "run_at": "tomorrow"}
    assert _create(internal_client, device_id, body).status_code == 422


@pytest.mark.parametrize("body", [{}, {"payload": None}, {"payload": "on"}, {"payload": [1]}])
def test_missing_or_malformed_payload_is_rejected(internal_client, device_id, body):
    assert _create(internal_client, device_id, body).status_code == 422


def test_rejected_command_does_not_change_desired_state_or_queue(internal_client, device_id, device_key):
    before = internal_client.get(f"/api/v1/management/devices/{device_id}").json()
    assert _create(internal_client, device_id, {"payload": {"target_temperature": 99}}).status_code == 422
    after = internal_client.get(f"/api/v1/management/devices/{device_id}").json()
    assert after["device_state"]["desired_state"] == before["device_state"]["desired_state"]


def test_unknown_device_is_404_for_a_valid_command(internal_client):
    assert _create(internal_client, 999999, {"payload": {"power": True}}).status_code == 404


# --- Device results -----------------------------------------------------------


def _result(client, device_key, command_id, body):
    return client.post(
        f"/api/v1/device/commands/{command_id}/result", json=body, headers={"X-Device-Key": device_key}
    )


def _new_command(client, device_id, payload=None):
    response = _create(client, device_id, {"payload": payload or {"power": True, "target_temperature": 22}})
    assert response.status_code == 201
    return response.json()["id"]


def test_valid_result_updates_reported_state(internal_client, device_id, device_key):
    command_id = _new_command(internal_client, device_id)
    response = _result(
        internal_client, device_key, command_id,
        {"status": "completed", "result": {"power": True, "target_temperature": 22}},
    )
    assert response.status_code == 200
    state = internal_client.get(f"/api/v1/management/devices/{device_id}").json()["device_state"]
    assert state["reported_state"] == {"power": True, "target_temperature": 22}


@pytest.mark.parametrize(
    "body",
    [
        {"status": "completed", "result": {"target_temperature": 99}},
        {"status": "completed", "result": {"target_temperature": "22"}},
        {"status": "completed", "result": {"target_temperature": 22.5}},
        {"status": "completed", "result": {"power": "on"}},
        {"status": "completed", "result": "ok"},
        {"status": "completed", "result": [1, 2]},
        {"status": "failed", "result": {"target_temperature": 5}},
        {"status": "pending", "result": {}},
        {"status": "bogus"},
        {},
    ],
)
def test_malformed_results_are_422_not_500(internal_client, device_id, device_key, body):
    command_id = _new_command(internal_client, device_id)
    assert _result(internal_client, device_key, command_id, body).status_code == 422
    # ...and the command is still pending, so it isn't lost.
    assert internal_client.get(f"/api/v1/management/commands/{command_id}").json()["status"] == "pending"


@pytest.mark.parametrize("result", [None, {}])
def test_empty_results_are_accepted(internal_client, device_id, device_key, result):
    command_id = _new_command(internal_client, device_id)
    body = {"status": "failed", "result": result}
    assert _result(internal_client, device_key, command_id, body).status_code == 200


def test_unknown_result_keys_are_ignored_and_not_stored(internal_client, device_id, device_key):
    command_id = _new_command(internal_client, device_id)
    body = {"status": "completed", "result": {"power": False, "firmware": "x"}}
    assert _result(internal_client, device_key, command_id, body).status_code == 200
    stored = internal_client.get(f"/api/v1/management/commands/{command_id}").json()["result"]
    assert stored == {"power": False}

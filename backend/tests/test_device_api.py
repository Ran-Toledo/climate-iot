"""Device key checks and the device-only listener's route surface."""

import pytest

HW_ID = "test-hw-001"
REGISTER = {"hardware_id": HW_ID, "device_type": "climate_controller", "name": "Test"}


def _register(client, key):
    return client.post("/api/v1/device/register", json=REGISTER, headers={"X-Device-Key": key})


# --- X-Device-Key -----------------------------------------------------------


@pytest.mark.usefixtures("device_key")
def test_missing_key_is_401(device_client):
    assert device_client.post("/api/v1/device/register", json=REGISTER).status_code == 401


@pytest.mark.usefixtures("device_key")
def test_wrong_key_is_401(device_client):
    assert _register(device_client, "wrong-key").status_code == 401


@pytest.mark.usefixtures("device_key")
def test_non_ascii_key_is_401_not_500(device_client):
    # Starlette decodes header bytes as latin-1, so this arrives as a
    # non-ASCII str; compare_digest on str would raise TypeError.
    response = device_client.post(
        "/api/v1/device/register", json=REGISTER, headers={"X-Device-Key": "kéy".encode("latin-1")}
    )
    assert response.status_code == 401


@pytest.mark.usefixtures("device_key")
def test_auth_is_checked_before_body_validation(device_client):
    # An unauthenticated caller must not learn the schema from a 422.
    response = device_client.post("/api/v1/device/telemetry", json={"bogus": True})
    assert response.status_code == 401


def test_right_key_allows_every_device_route(device_client, device_key):
    headers = {"X-Device-Key": device_key}
    assert _register(device_client, device_key).status_code == 200
    assert (
        device_client.post("/api/v1/device/heartbeat", json={"hardware_id": HW_ID}, headers=headers).status_code
        == 200
    )
    assert (
        device_client.post(
            "/api/v1/device/telemetry",
            json={"hardware_id": HW_ID, "temperature": 22.5, "humidity": 50},
            headers=headers,
        ).status_code
        == 201
    )
    response = device_client.get("/api/v1/device/commands/next", params={"hardware_id": HW_ID}, headers=headers)
    assert response.status_code == 200
    # Command results: an unknown id is a 404 (past the key check).
    response = device_client.post(
        "/api/v1/device/commands/999999/result",
        json={"status": "completed", "result": {}},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.usefixtures("no_device_key")
def test_unset_key_fails_closed_with_503(device_client):
    assert _register(device_client, "anything").status_code == 503
    assert device_client.post("/api/v1/device/register", json=REGISTER).status_code == 503


def test_blank_key_counts_as_unset(device_client, monkeypatch):
    monkeypatch.setenv("DEVICE_API_KEY", "   ")
    assert _register(device_client, "").status_code == 503


def test_device_routes_need_the_key_on_the_internal_listener_too(internal_client, device_key):
    assert internal_client.post("/api/v1/device/register", json=REGISTER).status_code == 401
    assert _register(internal_client, device_key).status_code == 200


# --- Device listener: device routes only --------------------------------------


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/management/devices"),
        ("GET", "/api/v1/management/devices/1"),
        ("POST", "/api/v1/management/devices/1/commands"),
        ("DELETE", "/api/v1/management/devices/1"),
        ("GET", "/docs"),
        ("GET", "/redoc"),
        ("GET", "/openapi.json"),
        ("GET", "/docs/oauth2-redirect"),
        ("GET", "/health"),
        ("GET", "/"),
    ],
)
def test_device_listener_404s_everything_else(device_client, device_key, method, path):
    # Even with a valid key: the key only opens the device routes.
    response = device_client.request(method, path, headers={"X-Device-Key": device_key})
    assert response.status_code == 404


# --- Internal listener: full app ----------------------------------------------


@pytest.mark.parametrize("path", ["/api/v1/management/devices", "/health", "/docs", "/openapi.json"])
def test_internal_listener_serves_the_full_app(internal_client, path):
    assert internal_client.get(path).status_code == 200


def test_key_never_appears_in_the_openapi_schema_or_errors(internal_client, device_key):
    assert device_key not in internal_client.get("/openapi.json").text
    response = internal_client.post("/api/v1/device/register", json=REGISTER, headers={"X-Device-Key": "nope"})
    assert device_key not in response.text and "nope" not in response.text

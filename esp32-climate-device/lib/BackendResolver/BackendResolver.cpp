#include "BackendResolver.h"

#include <ESPmDNS.h>
#include <Preferences.h>
#include <WiFi.h>

namespace {
constexpr uint32_t kMdnsTimeoutMs = 2000;
constexpr int kFailuresBeforeResolve = 3;
// If the backend is simply down (not moved), don't spend 2 s on mDNS
// after every third failed request.
constexpr unsigned long kMinResolveIntervalMs = 30000;

constexpr const char *kNvsNamespace = "backend";
constexpr const char *kNvsKeyIp = "last_ip";

bool sameSubnet(const IPAddress &a, const IPAddress &b, const IPAddress &mask) {
  return (static_cast<uint32_t>(a) & static_cast<uint32_t>(mask)) ==
         (static_cast<uint32_t>(b) & static_cast<uint32_t>(mask));
}
}  // namespace

BackendResolver::BackendResolver(const char *hostname, const char *backendBaseUrl)
    : hostname_(hostname),
      configuredUrl_(backendBaseUrl),
      resolved_(false),
      mdnsStarted_(false),
      lastResolveMs_(0) {
  // "http://192.168.1.122:8080/x" -> prefix "http://", host
  // "192.168.1.122", rest ":8080/x".
  int hostStart = configuredUrl_.indexOf("://");
  hostStart = (hostStart < 0) ? 0 : hostStart + 3;
  int hostEnd = configuredUrl_.length();
  int colon = configuredUrl_.indexOf(':', hostStart);
  int slash = configuredUrl_.indexOf('/', hostStart);
  if (colon >= 0 && colon < hostEnd) hostEnd = colon;
  if (slash >= 0 && slash < hostEnd) hostEnd = slash;
  prefix_ = configuredUrl_.substring(0, hostStart);
  urlHost_ = configuredUrl_.substring(hostStart, hostEnd);
  portAndPath_ = configuredUrl_.substring(hostEnd);
  baseUrl_ = configuredUrl_;
}

bool BackendResolver::update(unsigned long nowMs, const String &deviceName,
                             int consecutiveFailures) {
  if (!resolved_) {
    resolve(deviceName);
    lastResolveMs_ = millis();
    return true;
  }
  if (consecutiveFailures >= kFailuresBeforeResolve &&
      nowMs - lastResolveMs_ >= kMinResolveIntervalMs) {
    Serial.print("[backend] ");
    Serial.print(consecutiveFailures);
    Serial.println(" consecutive request failures; resolving the backend address again.");
    resolve(deviceName);
    lastResolveMs_ = millis();
    return true;
  }
  return false;
}

void BackendResolver::resolve(const String &deviceName) {
  resolved_ = true;

  IPAddress ip;
  if (queryMdns(deviceName, ip)) {
    saveIpIfChanged(ip);
    use(ip.toString(), "mDNS");
    return;
  }
  if (loadSavedIp(ip)) {
    use(ip.toString(), "NVS (last good mDNS address)");
    return;
  }
  use(urlHost_, "BACKEND_BASE_URL");
}

bool BackendResolver::queryMdns(const String &deviceName, IPAddress &out) {
  if (hostname_ == nullptr || hostname_[0] == '\0') {
    Serial.println("[backend] mDNS: BACKEND_HOSTNAME not set in secrets.h; skipping.");
    return false;
  }
  if (!mdnsStarted_) {
    if (!MDNS.begin(deviceName.c_str())) {
      Serial.println("[backend] mDNS: MDNS.begin() failed; skipping.");
      return false;
    }
    mdnsStarted_ = true;
  }

  unsigned long t0 = millis();
  IPAddress ip = MDNS.queryHost(hostname_, kMdnsTimeoutMs);
  unsigned long elapsed = millis() - t0;

  Serial.print("[backend] mDNS: ");
  Serial.print(hostname_);
  Serial.print(".local -> ");
  if (ip == IPAddress(0, 0, 0, 0)) {
    Serial.print("no answer after ");
    Serial.print(elapsed);
    Serial.println(" ms");
    return false;
  }
  Serial.print(ip);
  Serial.print(" in ");
  Serial.print(elapsed);
  Serial.print(" ms");

  IPAddress local = WiFi.localIP();
  IPAddress mask = WiFi.subnetMask();
  if (!sameSubnet(ip, local, mask)) {
    Serial.print("; rejected, not in this device's subnet (");
    Serial.print(local);
    Serial.print(" / ");
    Serial.print(mask);
    Serial.println(")");
    return false;
  }
  Serial.println("; accepted");
  out = ip;
  return true;
}

bool BackendResolver::loadSavedIp(IPAddress &out) {
  Preferences prefs;
  if (!prefs.begin(kNvsNamespace, /*readOnly=*/true)) {
    Serial.println("[backend] NVS: no saved address.");
    return false;
  }
  uint32_t raw = prefs.getUInt(kNvsKeyIp, 0);
  prefs.end();
  if (raw == 0) {
    Serial.println("[backend] NVS: no saved address.");
    return false;
  }
  out = IPAddress(raw);
  Serial.print("[backend] NVS: saved address ");
  Serial.println(out);
  return true;
}

void BackendResolver::saveIpIfChanged(const IPAddress &ip) {
  Preferences prefs;
  if (!prefs.begin(kNvsNamespace, /*readOnly=*/false)) {
    Serial.println("[backend] NVS: couldn't open namespace; address not saved.");
    return;
  }
  uint32_t raw = static_cast<uint32_t>(ip);
  if (prefs.getUInt(kNvsKeyIp, 0) != raw) {
    prefs.putUInt(kNvsKeyIp, raw);
    Serial.print("[backend] NVS: saved ");
    Serial.println(ip);
  }
  prefs.end();
}

void BackendResolver::use(const String &host, const char *source) {
  baseUrl_ = prefix_ + host + portAndPath_;
  Serial.print("[backend] using ");
  Serial.print(baseUrl_);
  Serial.print(" (source: ");
  Serial.print(source);
  Serial.println(")");
}

void BackendResolver::eraseSavedAddress() {
  Preferences prefs;
  if (prefs.begin(kNvsNamespace, /*readOnly=*/false)) {
    prefs.clear();
    prefs.end();
  }
  Serial.println("[backend] NVS: saved address erased (test build).");
}

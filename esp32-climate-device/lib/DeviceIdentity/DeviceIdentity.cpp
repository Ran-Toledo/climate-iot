#include "DeviceIdentity.h"

String getHardwareId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[24];
  snprintf(buf, sizeof(buf), "esp32-%04x%08x", static_cast<uint16_t>(mac >> 32),
           static_cast<uint32_t>(mac));
  return String(buf);
}

import { Route, Routes } from "react-router-dom";
import { DeviceDetailPage } from "./pages/DeviceDetailPage";
import { DeviceGraphPage } from "./pages/DeviceGraphPage";
import { DeviceListPage } from "./pages/DeviceListPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DeviceListPage />} />
      <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
      <Route path="/devices/:deviceId/graph" element={<DeviceGraphPage />} />
    </Routes>
  );
}

export default App;

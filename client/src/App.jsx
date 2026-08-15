import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LaptopPage from "./pages/LaptopPage";
import MobilePage from "./pages/MobilePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main desktop/laptop application */}
        <Route path="/" element={<LaptopPage />} />

        {/* Mobile remote controller */}
        <Route path="/mobile" element={<MobilePage />} />

        {/* Optional direct laptop route */}
        <Route path="/laptop" element={<LaptopPage />} />

        {/* Unknown routes go back to laptop page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

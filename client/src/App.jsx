import { BrowserRouter, Routes, Route } from "react-router-dom";
import LaptopPage from "./pages/LaptopPage";
import MobilePage from "./pages/MobilePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MobilePage />} />
        <Route path="/mobile" element={<MobilePage />} />
        <Route path="/laptop" element={<LaptopPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
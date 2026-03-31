import { BrowserRouter, Routes, Route } from "react-router-dom";
import TaskSearchPage from "./pages/TaskSearchPage";
import CaseDetailPage from "./pages/CaseDetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TaskSearchPage />} />
        <Route
          path="/case/:taskId/:caseId"
          element={<CaseDetailPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

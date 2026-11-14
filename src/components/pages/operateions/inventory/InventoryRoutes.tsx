import React from "react";
import { Route, Routes } from "react-router-dom";
import InventoryManagementPage from "../../../../pages/operations/inventory/InventoryManagementPage";

export default function InventoryRoutes() {
  return (
    <Routes>
      <Route index element={<InventoryManagementPage />} />
    </Routes>
  );
}

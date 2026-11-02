import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./header";
import FetchingBar from "../ui/FetchingBar";

const MainMenuLayout = () => {
  return (
    // Use flex column so the header sits on top and main fills the rest
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <FetchingBar />
      {/* fixed header */}
      <div className="fixed top-0 left-0 right-0 z-10">
        <Header />
      </div>

      {/* main area: add top padding to account for header height and consistent page padding */}
      <main className="flex-1 pt-16 overflow-auto">
        {/* Page content outlet */}
        <Outlet />
      </main>
    </div>
  );
};

export default MainMenuLayout;

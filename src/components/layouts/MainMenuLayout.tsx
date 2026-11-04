import React, { Component, ReactNode, ErrorInfo } from "react";
import { Outlet } from "react-router-dom";
import Header from "./header";
import FetchingBar from "../ui/FetchingBar";
import CriticalPenaltyBanner from "../notifications/CriticalPenaltyBanner";

class BannerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("BannerErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const MainMenuLayout = () => {
  return (
    // Use flex column so the header sits on top and main fills the rest
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <FetchingBar />
      {/* fixed header */}
      <div className="fixed top-0 left-0 right-0 z-20">
        <Header />
      </div>

      {/* main area: top padding accounts for header height */}
      <main className="flex-1 pt-16 overflow-auto flex flex-col">
        {/* Sticky top critical penalty banner */}
        <div className="sticky top-0 z-10 w-full">
          <BannerErrorBoundary>
            <CriticalPenaltyBanner />
          </BannerErrorBoundary>
        </div>

        {/* Page content outlet */}
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainMenuLayout;

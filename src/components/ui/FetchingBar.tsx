import { useIsFetching } from "@tanstack/react-query";

/**
 * A thin animated bar along the top edge while any query is refreshing
 * in the background. Pages keep showing their cached data during that
 * time, so this is the only sign that newer data is on its way.
 */
export default function FetchingBar() {
  const fetching = useIsFetching();
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${
        fetching > 0 ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-full w-1/3 animate-[fetchbar_1.2s_ease-in-out_infinite] bg-primary/70" />
      <style>{`@keyframes fetchbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

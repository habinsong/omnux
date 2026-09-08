import { useEffect, useState } from "react";

/**
 * SSR-safe media query 훅. query 가 매칭되면 true. 화면 크기 변경 시 갱신된다.
 * 반응형 레이아웃에서 "데스크톱이면 다열, 좁으면 탭" 분기에 사용한다.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

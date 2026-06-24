import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

/** 全局「回到顶部」浮动按钮:滚动超过约一屏才出现,点击平滑回顶。长页面(专家库/文档/创意库等)适用。 */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 480);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="回到顶部"
      title="回到顶部"
      className={`fixed bottom-6 right-6 z-40 grid size-11 place-items-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-lg backdrop-blur-xl transition-all hover:text-foreground ${show ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
    >
      <ArrowUp className="size-5" />
    </button>
  );
}

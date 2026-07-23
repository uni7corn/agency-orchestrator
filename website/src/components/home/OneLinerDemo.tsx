import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

export function OneLinerDemo() {
  const { t, prefix } = useLanguage();
  const d = t.oneLiner;

  return (
    <section className="container-page py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{d.title}</h2>
        <p className="mt-4 text-muted-foreground">{d.desc}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto mt-10 max-w-5xl"
      >
        <Link
          to={prefix("/studio")}
          className="group block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-black/10 transition hover:border-primary/40 hover:shadow-primary/10"
        >
          <div className="flex items-center gap-2 border-b border-border/70 bg-muted/60 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
            <span className="ml-3 text-xs text-muted-foreground">ao.aiolaola.com/studio</span>
          </div>
          <img
            src="/screenshots/studio-workflows.webp"
            alt={d.imageAlt}
            loading="lazy"
            className="w-full transition duration-300 group-hover:scale-[1.01]"
          />
        </Link>

        <div className="mt-8 flex flex-col items-center gap-4">
          <Link
            to={prefix("/studio")}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90"
          >
            {d.cta}
            <ArrowRight className="size-4" />
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            {d.cliHint}{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              ao compose "{d.prompt}" --run
            </code>
          </p>
        </div>
      </motion.div>
    </section>
  );
}

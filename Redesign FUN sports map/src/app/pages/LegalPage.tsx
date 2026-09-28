import React, { useEffect } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { LEGAL_DOCUMENTS, LEGAL_VERSION, type LegalDocument } from "../../lib/legal";

const OTHER_LINKS: { slug: LegalDocument["slug"]; label: string }[] = [
  { slug: "terms", label: "Terms" },
  { slug: "privacy", label: "Privacy" },
  { slug: "guidelines", label: "Community Guidelines" },
  { slug: "child-safety", label: "Child Safety" },
];

/** /terms, /privacy, /guidelines and /child-safety. Public: guests read them before signing up. */
export default function LegalPage({ slug }: { slug: LegalDocument["slug"] }) {
  const doc = LEGAL_DOCUMENTS[slug];

  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · FUN`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  return (
    <main className="min-h-screen min-h-dvh bg-background px-4 py-8 text-slate-200 sm:px-6">
      <article className="mx-auto w-full max-w-2xl">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the map
        </Link>

        <h1 className="mt-4 text-3xl font-semibold text-white">{doc.title}</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated {LEGAL_VERSION}</p>
        <p className="mt-4 text-base leading-relaxed text-slate-300">{doc.summary}</p>

        {doc.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="mt-3 text-[15px] leading-relaxed text-slate-300">
                {p}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-300">
                {section.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <nav aria-label="Legal documents" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-sm">
          {OTHER_LINKS.filter((l) => l.slug !== slug).map((l) => (
            <Link key={l.slug} to={`/${l.slug}`} className="text-slate-400 hover:text-primary">
              {l.label}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}

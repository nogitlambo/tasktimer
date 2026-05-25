"use client";

import { useMemo, useState } from "react";
import AppImg from "@/components/AppImg";
import { filterUserGuideModules, type UserGuideModule } from "./content";

export default function UserGuideExplorer({ modules }: { modules: UserGuideModule[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => Array.from(new Set(modules.map((module) => module.category))), [modules]);
  const filteredModules = useMemo(() => filterUserGuideModules(modules, query, category), [category, modules, query]);

  return (
    <div className="userGuideExplorer">
      <section className="userGuideSearchPanel" aria-label="Guide search and filters">
        <div className="userGuideSearchField">
          <label htmlFor="userGuideSearchInput">Search the guide</label>
          <input
            id="userGuideSearchInput"
            type="search"
            value={query}
            placeholder="Search modules, steps, and tips"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="userGuideFilterRow" aria-label="Guide categories">
          <button
            className={`userGuideFilterBtn${category === "all" ? " isActive" : ""}`}
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {categories.map((nextCategory) => (
            <button
              className={`userGuideFilterBtn${category === nextCategory ? " isActive" : ""}`}
              type="button"
              aria-pressed={category === nextCategory}
              key={nextCategory}
              onClick={() => setCategory(nextCategory)}
            >
              {nextCategory}
            </button>
          ))}
        </div>
      </section>

      <div className="userGuideLayout">
        <aside className="userGuideToc" aria-label="User Guide table of contents">
          <div className="landingV2SectionLabel userGuideTocLabel">
            <span className="landingV2SectionIndex displayFont">00</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Contents</span>
          </div>
          <nav className="userGuideTocNav">
            {filteredModules.map((module, index) => (
              <a className="userGuideTocLink" href={`#${module.id}`} key={module.id}>
                <span className="displayFont">{String(index + 1).padStart(2, "0")}</span>
                <span>{module.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="userGuideArticles">
          {filteredModules.length ? (
            filteredModules.map((module, index) => (
              <article className="userGuideArticle" id={module.id} key={module.id}>
                <div className="landingV2SectionLabel">
                  <span className="landingV2SectionIndex displayFont">{String(index + 1).padStart(2, "0")}</span>
                  <span className="landingV2SectionLine" />
                  <span className="landingV2SectionName">{module.category}</span>
                </div>

                <div className="userGuideArticleHead">
                  <div>
                    <h2>{module.title}</h2>
                    <p>{module.summary}</p>
                  </div>
                  <a className="userGuideRouteLink displayFont" href={module.routeHref}>
                    Open module
                  </a>
                </div>

                <figure className="userGuideScreenshot">
                  <AppImg src={module.screenshot} alt={module.screenshotAlt} />
                  <figcaption>Sanitized demo screenshot for {module.title}.</figcaption>
                </figure>

                <div className="userGuideArticleGrid">
                  <section className="userGuideArticleBlock" aria-label={`${module.title} details`}>
                    <h3>What it does</h3>
                    <ul>
                      {module.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="userGuideArticleBlock" aria-label={`${module.title} how-to steps`}>
                    <h3>How to use it</h3>
                    {module.howTos.map((howTo) => (
                      <div className="userGuideHowTo" key={howTo.title}>
                        <h4>{howTo.title}</h4>
                        <ol>
                          {howTo.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </section>
                </div>

                <section className="userGuideTips" aria-label={`${module.title} tips`}>
                  <h3>Tips</h3>
                  <div className="userGuideTipGrid">
                    {module.tips.map((tip) => (
                      <p key={tip}>{tip}</p>
                    ))}
                  </div>
                </section>
              </article>
            ))
          ) : (
            <section className="userGuideEmpty" aria-live="polite">
              <h2>No guide modules matched your search.</h2>
              <p>Clear the search field or choose another category.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

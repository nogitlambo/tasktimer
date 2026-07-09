"use client";

import { useMemo, useState } from "react";
import AppImg from "@/components/AppImg";
import { filterUserGuideModules, type UserGuideModule } from "./content";

function moduleSearchId(module: UserGuideModule) {
  return `guide-${module.id}`;
}

export default function UserGuideExplorer({ modules }: { modules: UserGuideModule[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => Array.from(new Set(modules.map((module) => module.category))), [modules]);
  const filteredModules = useMemo(() => filterUserGuideModules(modules, query, category), [category, modules, query]);

  return (
    <>
      <section className="primitiveSection" aria-labelledby="user-guide-find">
        <div className="primitiveSectionHeader">
          <div>
            <h2 id="user-guide-find">Find Help</h2>
            <p className="modalSubtext">
              Filter by module area or search for an action such as manual entry, friend requests, or notifications.
            </p>
          </div>
        </div>

        <div className="primitiveExamplePanel">
          <div className="field primitiveField">
            <label htmlFor="userGuideSearchInput">Search the guide</label>
            <input
              id="userGuideSearchInput"
              type="search"
              value={query}
              placeholder="Search modules, steps, and tips"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="primitiveExamplePanel" aria-label="Guide categories">
          <div className="primitiveInlineGrid">
            <button
              className={`btn btn-ghost small${category === "all" ? " isOn" : ""}`}
              type="button"
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
            >
              All
            </button>
            {categories.map((nextCategory) => (
              <button
                className={`btn btn-ghost small${category === nextCategory ? " isOn" : ""}`}
                type="button"
                aria-pressed={category === nextCategory}
                key={nextCategory}
                onClick={() => setCategory(nextCategory)}
              >
                {nextCategory}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="primitiveSection" aria-labelledby="user-guide-contents">
        <div className="primitiveSectionHeader">
          <div>
            <h2 id="user-guide-contents">Contents</h2>
            <p className="modalSubtext">
              Jump straight to the module you are using now.
            </p>
          </div>
        </div>

        <div className="primitiveExamplePanel">
          <div className="primitiveCardGrid">
            {filteredModules.map((module) => (
              <a className="btn btn-ghost small" href={`#${moduleSearchId(module)}`} key={module.id}>
                {module.title}
              </a>
            ))}
          </div>
        </div>

        <div className="settingsDetailNote" role="status">
          Showing {filteredModules.length} of {modules.length} modules.
        </div>
      </section>

      {filteredModules.length ? (
        filteredModules.map((module) => (
          <article className="primitiveSection" id={moduleSearchId(module)} key={module.id}>
            <div className="primitiveSectionHeader">
              <div>
                <h2>{module.title}</h2>
                <p className="modalSubtext">{module.summary}</p>
              </div>
              <a className="btn btn-accent small" href={module.routeHref}>
                Open Module
              </a>
            </div>

            <div className="primitiveExamplePanel">
              <section className="dashboardCard primitiveDashboardCard" aria-label={`${module.title} purpose`}>
                <h3 className="dashboardCardTitle">What This Is For</h3>
                <AppImg
                  src={module.screenshot}
                  alt={module.screenshotAlt}
                  width={280}
                  height={175}
                  loading="lazy"
                  decoding="async"
                />
                <ul className="modalSubtext">
                  {module.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </section>

              <section className="dashboardCard primitiveDashboardCard" aria-label={`${module.title} notes`}>
                <h3 className="dashboardCardTitle">Helpful Notes</h3>
                <div className="primitiveControlStack">
                  {module.tips.map((tip) => (
                    <p className="settingsDetailNote" key={tip}>
                      {tip}
                    </p>
                  ))}
                </div>
              </section>
            </div>

            <div className="primitiveExamplePanel">
              {module.howTos.map((howTo) => (
                <section className="dashboardCard primitiveDashboardCard" aria-label={howTo.title} key={howTo.title}>
                  <h3 className="dashboardCardTitle">{howTo.title}</h3>
                  <ol className="modalSubtext">
                    {howTo.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </article>
        ))
      ) : (
        <section className="primitiveSection" aria-live="polite">
          <div className="primitiveSectionHeader">
            <div>
              <h2>No Matches</h2>
              <p className="modalSubtext">Clear the search field or choose another category.</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

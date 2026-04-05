"use client";

import type React from "react";
import AppImg from "@/components/AppImg";
import type { SettingsNavItem } from "./types";

export function MenuIconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <AppImg className="settingsMenuItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsMenuItemText">{label}</span>
    </>
  );
}

function SettingsNavTile({
  id,
  icon,
  label,
  active,
  onClick,
}: {
  id?: string;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      className={`menuItem settingsNavTile${active ? " isActive" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <AppImg className="settingsMenuItemIcon settingsNavItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsNavRowText">{label}</span>
    </button>
  );
}

export function SettingsNav({
  navItems,
  activePane,
  onSelectPane,
}: {
  navItems: SettingsNavItem[];
  activePane: SettingsNavItem["key"] | null;
  onSelectPane: (pane: SettingsNavItem["key"]) => void;
}) {
  return (
    <aside className="settingsNavPanel dashboardCard" aria-label="Settings navigation">
      <div className="settingsNavTopActions">
        <button className="btn btn-ghost small settingsNavExitBtn" id="closeMenuBtn" type="button" aria-label="Close">
          Close
        </button>
      </div>
      <div className="settingsNavGrid">
        {navItems.map((item) => (
          <SettingsNavTile
            key={item.key}
            id={item.id}
            icon={item.icon}
            label={item.label}
            active={activePane === item.key}
            onClick={() => onSelectPane(item.key)}
          />
        ))}
      </div>
    </aside>
  );
}

export function SettingsDetailPane({
  active,
  paneClassName = "",
  title,
  subtitle,
  children,
}: {
  active: boolean;
  paneClassName?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`settingsDetailPane${active ? " isActive" : ""}${paneClassName ? ` ${paneClassName}` : ""}`}
      aria-hidden={active ? "false" : "true"}
    >
      <div className="settingsDetailHead">
        <h2 className="settingsDetailTitle">{title}</h2>
        <p className="settingsDetailText">{subtitle}</p>
      </div>
      <div className="settingsDetailBody">{children}</div>
    </section>
  );
}

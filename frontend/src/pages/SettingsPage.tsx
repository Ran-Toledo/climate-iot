import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon, MonitorIcon, MoonIcon, SunIcon } from "../components/icons";
import { setThemePreference, useTheme, type ThemePreference } from "../lib/theme";

const SCREEN_MODES: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <MonitorIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

export function SettingsPage() {
  const { preference, resolved } = useTheme();

  return (
    <div className="mx-auto max-w-md px-5 pt-6 pb-10">
      <div className="flex items-center gap-1">
        <Link
          to="/"
          aria-label="Back to devices"
          className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-ink no-underline"
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="m-0 text-lg font-semibold">Settings</h1>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <fieldset className="m-0 border-0 p-0">
          <legend className="p-0 text-sm font-semibold">Screen mode</legend>
          <p className="mt-1 mb-3 text-[13px] text-ink-2">
            {preference === "system"
              ? `Follows this device's setting (currently ${resolved}).`
              : `Always ${preference}, whatever this device is set to.`}
          </p>

          {/* Native radios (keyboard and screen-reader friendly), drawn as a
              segmented control. */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-page p-1">
            {SCREEN_MODES.map((mode) => {
              const selected = preference === mode.value;
              return (
                <label
                  key={mode.value}
                  className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    selected ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-ink-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="screen-mode"
                    value={mode.value}
                    checked={selected}
                    onChange={() => setThemePreference(mode.value)}
                    className="sr-only"
                  />
                  {mode.icon}
                  {mode.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <p className="mt-3 mb-0 px-1 text-xs text-ink-3">Settings are saved in this browser only.</p>
    </div>
  );
}

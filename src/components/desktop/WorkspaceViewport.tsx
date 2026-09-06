import { memo, useEffect, useMemo } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAppTabStore } from "../../stores/appTabStore";
import { useAppIntegration } from "../../hooks/useAppIntegration";
import EmptyWorkspace from "./EmptyWorkspace";
import ManagedAppSurface from "./ManagedAppSurface";
import ExternalFallbackSurface from "./ExternalFallbackSurface";
import UnsupportedAppSurface from "./UnsupportedAppSurface";
import WindowFrame from "./WindowFrame";
import styles from "./WorkspaceViewport.module.css";

export default function WorkspaceViewport() {
  // honey: scoped selectors - avoid global rerender on 750ms resource or unrelated OS Tab (§28)
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  const osTabs = useWorkspaceStore((s) => s.osTabs);
  const active = useMemo(() => osTabs.find((t) => t.id === activeOsTabId) ?? osTabs[0] ?? null, [osTabs, activeOsTabId]);

  const tabs = useAppTabStore((s) => (activeOsTabId ? s.appTabsByOsTab[activeOsTabId] ?? [] : []));
  const activeAppTabId = useAppTabStore((s) => (activeOsTabId ? s.activeAppTabIdByOsTab[activeOsTabId] ?? null : null));

  const switchAppTab = useAppTabStore((s) => s.switchAppTab);
  useEffect(() => {
    if (activeOsTabId && tabs.length > 0 && !activeAppTabId) {
      switchAppTab(activeOsTabId, tabs[0]!.id);
    }
  }, [activeOsTabId, tabs, activeAppTabId, switchAppTab]);

  if (!active) {
    return (
      <div id="workspace-main" className={styles.viewport} role="main" aria-label="Workspace viewport" tabIndex={-1}>
        <EmptyWorkspace key="new-workspace" workspaceName="New Workspace" />
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div id="workspace-main" className={styles.viewport} role="main" aria-label="Workspace viewport" tabIndex={-1}>
        <EmptyWorkspace key={active.id} workspaceName={active.name} />
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeAppTabId) ?? tabs[0]!;

  return <WorkspaceSurface activeTab={activeTab} workspaceName={active.name} />;
}

const WorkspaceSurface = memo(function WorkspaceSurface({
  activeTab,
  workspaceName,
}: {
  activeTab: import("../../types/appTab").AppTab;
  workspaceName: string;
}) {
  const { integration, descriptor, runtime } = useAppIntegration(activeTab);

  const close = useAppTabStore((s) => s.closeAppTab);
  const content = useMemo(() => {
    if (!integration) return null;
    if (integration.kind === "unsupported") {
      return (
        <WindowFrame
          title={descriptor?.name ?? activeTab.label}
          stateDotState={activeTab.state}
          stateText={activeTab.state}
          kindBadge="unsupported"
          kindBadgeKind="unsupported"
          onClose={() => close(activeTab.osTabId, activeTab.id)}
          onMinimize={() => {}}
        >
          <UnsupportedAppSurface descriptor={descriptor} label={activeTab.label} reason={integration.reason} />
        </WindowFrame>
      );
    }
    if (integration.kind === "external") {
      return (
        <WindowFrame
          title={descriptor?.name ?? activeTab.label}
          stateDotState={activeTab.state}
          stateText={activeTab.state}
          kindBadge="external"
          kindBadgeKind="external"
          onClose={() => close(activeTab.osTabId, activeTab.id)}
          onMinimize={() => {}}
        >
          <ExternalFallbackSurface descriptor={descriptor} label={activeTab.label} />
        </WindowFrame>
      );
    }
    if (integration.kind === "embedded") {
      return <ManagedAppSurface appTab={activeTab} descriptor={descriptor} integrationKind="embedded" runtime={runtime} embedded />;
    }
    return <ManagedAppSurface appTab={activeTab} descriptor={descriptor} integrationKind="managed" runtime={runtime} />;
  }, [integration, descriptor, runtime, activeTab, close]);

  const kind = integration?.kind ?? "managed";

  return (
    <div id="workspace-main" className={styles.viewport} role="main" aria-label="Workspace viewport" tabIndex={-1}>
      <div className={styles.surfaceHeader} aria-live="polite">
        <span className={styles.surfaceLabel}>Workspace:</span>
        <span className={styles.surfaceValue} title={workspaceName}>
          {workspaceName}
        </span>
        <span className={styles.surfaceSep} aria-hidden>·</span>
        <span className={styles.surfaceLabel}>App surface:</span>
        <span className={styles.surfaceValue} title={activeTab.label}>
          {activeTab.label}
        </span>
        <span className={styles.surfaceState} data-state={activeTab.state}>
          - {activeTab.state}
        </span>
        <span className={styles.kindCrumb} data-kind={kind}>
          · {kind}
          {integration?.canEmbed ? " · canEmbed" : ""}
        </span>
      </div>
      <div key={activeTab.id} className={styles.surfaceBody} role="region" aria-label={`${activeTab.label} surface`}>
        {content}
      </div>
    </div>
  );
});

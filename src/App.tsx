import React, { useState, useCallback } from 'react';
import { ThemeProvider } from './components/theme/ThemeManager';
import { AppShell, DEFAULT_PROBLEMS } from './components/layout/AppShell';
import { StressTestingPanel } from './components/stress/StressTestingPanel';
import {
  SettingsModal,
  loadStoredSettings,
  type AppSettings,
} from './components/settings/SettingsModal';
import { useCompanion } from './hooks/useCompanion';
import type { Problem } from './types';

export default function App() {
  const [problems, setProblems] = useState<Problem[]>(DEFAULT_PROBLEMS);
  const [activeProblemId, setActiveProblemId] = useState<string>(
    DEFAULT_PROBLEMS[0]?.id || 'problem-1'
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isStressTestOpen, setIsStressTestOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());

  const activeProblem = problems.find((p) => p.id === activeProblemId) || problems[0];

  const handleNewCompanionProblem = useCallback((newProblem: Problem) => {
    setProblems((prev) => {
      const existing = prev.find(
        (p) => p.name === newProblem.name || (newProblem.url && p.url === newProblem.url)
      );
      if (existing) {
        setActiveProblemId(existing.id);
        return prev;
      }
      return [...prev, newProblem];
    });
    setActiveProblemId(newProblem.id);
  }, []);

  useCompanion({
    onNewProblem: handleNewCompanionProblem,
    pathTemplate: settings.pathTemplate,
    defaultLanguage: settings.defaultLanguage,
    templates: settings.templates,
  });

  const handleAddStressTestCase = useCallback(
    (tc: { input: string; output: string }) => {
      setProblems((prev) =>
        prev.map((p) =>
          p.id === activeProblemId
            ? {
                ...p,
                testcases: [
                  ...p.testcases,
                  {
                    id: `tc-stress-${Date.now()}`,
                    input: tc.input,
                    output: tc.output,
                    custom: true,
                  },
                ],
              }
            : p
        )
      );
    },
    [activeProblemId]
  );

  return (
    <ThemeProvider>
      <AppShell
        problems={problems}
        activeProblemId={activeProblemId}
        onSelectProblem={setActiveProblemId}
        onProblemsChange={setProblems}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenStressTest={() => setIsStressTestOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newSettings) => setSettings(newSettings)}
      />

      <StressTestingPanel
        isOpen={isStressTestOpen}
        onClose={() => setIsStressTestOpen(false)}
        activeProblem={activeProblem}
        onAddTestCase={handleAddStressTestCase}
      />
    </ThemeProvider>
  );
}

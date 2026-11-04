import React, { useState, useCallback } from 'react';
import { ThemeProvider } from './components/theme/ThemeManager';
import { AppShell, DEFAULT_PROBLEMS } from './components/layout/AppShell';
import {
  SettingsModal,
  loadStoredSettings,
  type AppSettings,
} from './components/settings/SettingsModal';
import { useCompanion } from './hooks/useCompanion';
import { type Problem, padLinesToMinimum } from './types';

export default function App() {
  const [problems, setProblems] = useState<Problem[]>(DEFAULT_PROBLEMS);
  const [activeProblemId, setActiveProblemId] = useState<string>(
    DEFAULT_PROBLEMS[0]?.id || 'problem-1'
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());

  const handleNewCompanionProblem = useCallback((newProblem: Problem) => {
    setProblems((prev) => {
      const existing = prev.find(
        (p) => p.name === newProblem.name || (newProblem.url && p.url === newProblem.url)
      );
      if (existing) {
        setActiveProblemId(existing.id);
        return prev;
      }
      setActiveProblemId(newProblem.id);
      return [...prev, newProblem];
    });
  }, []);

  useCompanion({
    onNewProblem: handleNewCompanionProblem,
    pathTemplate: settings.pathTemplate,
    defaultLanguage: settings.defaultLanguage,
    templates: settings.templates,
  });

  const handleCreateNewProblem = useCallback(() => {
    const lang = settings.defaultLanguage || 'cpp';
    const rawTemplate = settings.templates?.[lang] || '';
    const probName = `Problem ${problems.length + 1}`;
    const code = padLinesToMinimum(
      rawTemplate
        .replace(/\$\{PROBLEM_NAME\}/g, probName)
        .replace(/\$\{DATE\}/g, new Date().toLocaleDateString())
        .replace(/\$\{TIME\}/g, new Date().toLocaleTimeString()),
      40
    );
    const newId = `problem-${Date.now()}`;
    const newProblem: Problem = {
      id: newId,
      name: probName,
      group: 'Custom',
      language: lang,
      code,
      timeLimit: settings.defaultTimeLimit || 2000,
      memoryLimit: settings.defaultMemoryLimit || 256,
      testcases: [
        { id: `tc-${Date.now()}-1`, input: '1\n', output: '1\n', custom: true },
      ],
    };
    setProblems((prev) => [...prev, newProblem]);
    setActiveProblemId(newId);
  }, [settings, problems.length]);

  return (
    <ThemeProvider>
      <AppShell
        problems={problems}
        activeProblemId={activeProblemId}
        onSelectProblem={setActiveProblemId}
        onNewProblem={handleCreateNewProblem}
        onProblemsChange={setProblems}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(newSettings) => setSettings(newSettings)}
      />
    </ThemeProvider>
  );
}

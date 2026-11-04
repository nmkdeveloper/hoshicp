import React, { useState, useCallback } from 'react';
import { ThemeProvider } from './components/theme/ThemeManager';
import { AppShell, createDefaultProblem } from './components/layout/AppShell';
import {
  SettingsModal,
  loadStoredSettings,
  type AppSettings,
} from './components/settings/SettingsModal';
import { useCompanion } from './hooks/useCompanion';
import { type Problem, padLinesToMinimum } from './types';

export default function App() {
  const [problems, setProblems] = useState<Problem[]>(() => [createDefaultProblem()]);
  const [activeProblemId, setActiveProblemId] = useState<string>('problem-1');
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
    const ext = lang === 'python' ? 'py' : lang === 'rust' ? 'rs' : lang === 'java' ? 'java' : 'cpp';
    const probName = `solution_${problems.length + 1}.${ext}`;
    const rawTemplate = settings.templates?.[lang] || '';
    const code = padLinesToMinimum(
      rawTemplate
        .replace(/\$\{PROBLEM_NAME\}/g, probName)
        .replace(/\$\{DATE\}/g, new Date().toLocaleDateString())
        .replace(/\$\{TIME\}/g, new Date().toLocaleTimeString()),
      120
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
        { id: `tc-${Date.now()}-1`, input: '', output: '', custom: true },
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

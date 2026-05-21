/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { invoke } from '@tauri-apps/api/core';
import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx';
import { Button } from '../../components/Button/Button.tsx';
import { BarLabel } from '../../components/ShortcutsBar/BarLabel.tsx';
import gearIcon from '../../assets/icons/gear.svg';
import classes from './Dashboard.module.scss';

interface DashboardShortcutsBarProps {
  onNextGroup: () => void;
  onPreviousGroup: () => void;
  onArrowNavigation: (direction: 'up' | 'down' | 'left' | 'right') => void;
}

export function DashboardShortcutsBar({ 
  onNextGroup, 
  onPreviousGroup, 
  onArrowNavigation 
}: DashboardShortcutsBarProps) {
  const handleOpenConfig = async () => {
    try {
      const configPath = await invoke<string>('get_kubby_config_path');
      await invoke('open_file_in_editor', { path: configPath });
    } catch (e) {
      console.error('Failed to open config file:', e);
    }
  };

  return (
    <ShortcutsBar>
      <BarLabel>Groups:</BarLabel>
      <Button
        label="Previous"
        shortcut="Shift+Tab"
        onClick={onPreviousGroup}
        tooltip="Navigate to previous group"
      />
      <Button
        label="Next"
        shortcut="Tab"
        onClick={onNextGroup}
        tooltip="Navigate to next group"
      />
      <BarLabel>Clusters:</BarLabel>
      <Button
        label="Prev"
        shortcut="←"
        onClick={() => onArrowNavigation('left')}
        tooltip="Navigate left"
      />
      <Button
        label="Next"
        shortcut="→"
        onClick={() => onArrowNavigation('right')}
        tooltip="Navigate right"
      />
      <BarLabel>Namespaces:</BarLabel>
      <Button
        label="Up"
        shortcut="↑"
        onClick={() => onArrowNavigation('up')}
        tooltip="Navigate up"
      />
      <Button
        label="Down"
        shortcut="↓"
        onClick={() => onArrowNavigation('down')}
        tooltip="Navigate down"
      />
      <div style={{ flexGrow: 1 }} />
      <button
        class={classes.settingsButton}
        onClick={handleOpenConfig}
        title="Open configuration file"
      >
        <img src={gearIcon} alt="Settings" />
      </button>
    </ShortcutsBar>
  );
}

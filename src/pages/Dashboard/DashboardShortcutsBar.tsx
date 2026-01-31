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

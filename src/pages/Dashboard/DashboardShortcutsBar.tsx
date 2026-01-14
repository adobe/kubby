import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx';
import { Button } from '../../components/Button/Button.tsx';

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
  return (
    <ShortcutsBar>
      <Button
        label="Previous Group"
        shortcut="Shift+Tab"
        onClick={onPreviousGroup}
        tooltip="Navigate to previous group"
      />
      <Button
        label="Next Group"
        shortcut="Tab"
        onClick={onNextGroup}
        tooltip="Navigate to next group"
      />
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
    </ShortcutsBar>
  );
}

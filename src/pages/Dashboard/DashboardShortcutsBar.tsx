import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx';
import { Button } from '../../components/Button/Button.tsx';
import {BarLabel} from '../../components/ShortcutsBar/BarLabel.tsx'

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

# Round AL: independent canvas track pixels

Added actual creator UI/canvas regression on black artwork: manual track initially has0red pixels, play starts red A motion, centroidX194→248, state switch preserves track progress toX277, stop hides it again. Fixed blue B remains in contact sheet, inspected. This extends AJ's control/sampler-only proof to live independent canvas clock pixels across one state switch. Does not prove state-loop/auto-next timing or all overlay-clock combinations. Test-only, no deploy; live staging remainsrc51.

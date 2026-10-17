// The viewer's one icon module (design/system/DESIGN.md, Icons). Feature code
// imports icons from here, so the set can be swapped in one place.
export {
  IconAlertTriangle as AlertIcon,
  IconBrain as ReasoningIcon,
  IconBulb as HypothesisIcon,
  IconCheck as CheckIcon,
  IconChevronLeft as StepBackIcon,
  IconChevronRight as StepForwardIcon,
  IconChevronsRight as LastStepIcon,
  IconCircleCheck as AnswerIcon,
  IconCopy as CopyIcon,
  IconDeviceFloppy as SaveIcon,
  IconDownload as DownloadIcon,
  IconEye as ObservationIcon,
  IconGitBranch as DecisionIcon,
  IconLayoutSidebar as SidebarIcon,
  IconLayoutSidebarRight as RailIcon,
  IconMaximize as FitIcon,
  IconPlayerPause as PauseIcon,
  IconPlayerPlay as PlayIcon,
  IconRefresh as UpdateIcon,
  IconRotate as FirstStepIcon,
  IconSearch as SearchIcon,
  IconTool as ActionIcon,
  IconUpload as ImportIcon,
  IconX as CloseIcon,
  IconZoomIn as ZoomInIcon,
  IconZoomOut as ZoomOutIcon,
} from "@tabler/icons-react";

/** Icon size in controls (DESIGN.md: 14px, stroke 1.75). */
export const ICON = { size: 14, stroke: 1.75 } as const;

import type { Transition, Variants } from 'framer-motion';

// ============================================================================
// Spring 配置
// ============================================================================

/**
 * 快速弹性 - 用于主要交互（面板切换、对话框等）
 * 体感时长约 150-200ms
 */
export const springFast: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.8,
};

/**
 * 标准弹性 - 用于面板伸缩等布局动画
 * 与现有 panelTransition 保持一致
 */
export const springStandard: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

/**
 * 柔和弹性 - 用于次要动画（tooltip、微交互）
 */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
};

/**
 * 快速线性过渡 - 用于简单的淡入淡出
 */
export const transitionFast: Transition = {
  duration: 0.15,
  ease: 'easeOut',
};

/**
 * 面板过渡 - 向后兼容，等同于 springStandard
 * @deprecated 请使用 springStandard
 */
export const panelTransition = springStandard;

// ============================================================================
// 通用 Variants
// ============================================================================

/**
 * 淡入淡出
 */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * 缩放入场 - 用于 Dialog、Menu 等弹出层
 */
export const scaleInVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * 向上滑入 - 用于 Toast、Tooltip 等
 */
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

/**
 * 向下滑入
 */
export const slideDownVariants: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

/**
 * 向右滑入 - 用于右侧抽屉
 */
export const slideRightVariants: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
};

/**
 * 向左滑入 - 用于左侧抽屉
 */
export const slideLeftVariants: Variants = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

// ============================================================================
// 高度动画配置
// ============================================================================

/**
 * 高度展开/收起 - 用于 Accordion、列表展开等
 */
export const heightVariants: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
};

/**
 * 宽度展开/收起 - 用于侧边栏
 */
export const widthVariants: Variants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: 'auto', opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

// ============================================================================
// 列表动画配置
// ============================================================================

/**
 * 列表容器 - 配合 staggerChildren 使用
 */
export const listContainerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
  exit: { opacity: 0 },
};

/**
 * 列表项
 */
export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

// ============================================================================
// 微交互配置
// ============================================================================

/**
 * 按钮点击缩放
 */
export const tapScale = { scale: 0.97 };

/**
 * 悬浮微放大
 */
export const hoverScale = { scale: 1.02 };

/**
 * 图标按钮悬浮
 */
export const iconButtonHover = { scale: 1.1 };

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 根据方向获取滑入动画 variants
 */
export function getSlideVariants(direction: 'up' | 'down' | 'left' | 'right'): Variants {
  switch (direction) {
    case 'up':
      return slideUpVariants;
    case 'down':
      return slideDownVariants;
    case 'left':
      return slideLeftVariants;
    case 'right':
      return slideRightVariants;
  }
}

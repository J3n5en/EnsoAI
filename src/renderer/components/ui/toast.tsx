'use client';

import { Toast } from '@base-ui/react/toast';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  SendIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

const toastManager = Toast.createToastManager();
const anchoredToastManager = Toast.createToastManager();

const TOAST_ICONS = {
  error: CircleAlertIcon,
  info: InfoIcon,
  loading: LoaderCircleIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
} as const;

type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface ToastProviderProps extends Toast.Provider.Props {
  position?: ToastPosition;
}

function ToastProvider({ children, position = 'bottom-right', ...props }: ToastProviderProps) {
  return (
    <Toast.Provider timeout={5000} toastManager={toastManager} {...props}>
      {children}
      <Toasts position={position} />
    </Toast.Provider>
  );
}

interface SendToSessionButtonProps {
  title: string;
  description?: string;
  onClose?: () => void;
}

function SendToSessionButton({ title, description, onClose }: SendToSessionButtonProps) {
  const { t } = useI18n();
  const activeSessionId = useTerminalWriteStore((s) => s.activeSessionId);
  const writeToActive = useTerminalWriteStore((s) => s.writeToActive);
  const focusActive = useTerminalWriteStore((s) => s.focusActive);

  // Only show button if there's an active session
  if (!activeSessionId) return null;

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const prefix = t('Fix this error:');
    const errorMessage = description ? `${prefix} ${title}\n${description}` : `${prefix} ${title}`;
    const sent = writeToActive(`${errorMessage} `);
    if (sent) {
      focusActive();
      onClose?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      title={t('Send to session')}
    >
      <SendIcon className="h-3.5 w-3.5" />
      <span>{t('Send to session')}</span>
    </button>
  );
}

function Toasts({ position = 'bottom-right' }: { position: ToastPosition }) {
  const { toasts } = Toast.useToastManager();
  const isTop = position.startsWith('top');

  return (
    <Toast.Portal data-slot="toast-portal">
      <Toast.Viewport
        className={cn(
          'fixed z-[9999] mx-auto flex w-[calc(100%-var(--toast-inset)*2)] max-w-[480px] [--toast-inset:--spacing(4)] sm:[--toast-inset:--spacing(8)]',
          // Vertical positioning
          'data-[position*=top]:top-(--toast-inset)',
          'data-[position*=bottom]:bottom-(--toast-inset)',
          // Horizontal positioning
          'data-[position*=left]:left-(--toast-inset)',
          'data-[position*=right]:right-(--toast-inset)',
          'data-[position*=center]:-translate-x-1/2 data-[position*=center]:left-1/2'
        )}
        data-position={position}
        data-slot="toast-viewport"
      >
        {toasts.map((toast) => {
          const Icon = toast.type ? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS] : null;

          return (
            <Toast.Root
              className={cn(
                'absolute z-[calc(9999-var(--toast-index))] h-(--toast-calc-height) w-full rounded-lg border bg-popover bg-clip-padding text-popover-foreground shadow-lg [transition:transform_.5s_cubic-bezier(.22,1,.36,1),opacity_.5s,height_.15s] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-clip-border dark:before:shadow-[0_-1px_--theme(--color-white/8%)]',
                // Base positioning using data-position
                'data-[position*=right]:right-0 data-[position*=right]:left-auto',
                'data-[position*=left]:right-auto data-[position*=left]:left-0',
                'data-[position*=center]:right-0 data-[position*=center]:left-0',
                'data-[position*=top]:top-0 data-[position*=top]:bottom-auto data-[position*=top]:origin-top',
                'data-[position*=bottom]:top-auto data-[position*=bottom]:bottom-0 data-[position*=bottom]:origin-bottom',
                // Gap fill for hover
                'after:absolute after:left-0 after:h-[calc(var(--toast-gap)+1px)] after:w-full',
                'data-[position*=top]:after:top-full',
                'data-[position*=bottom]:after:bottom-full',
                // Define some variables
                '[--toast-calc-height:var(--toast-frontmost-height,var(--toast-height))] [--toast-gap:--spacing(3)] [--toast-peek:--spacing(3)] [--toast-scale:calc(max(0,1-(var(--toast-index)*.1)))] [--toast-shrink:calc(1-var(--toast-scale))]',
                // Define offset-y variable
                'data-[position*=top]:[--toast-calc-offset-y:calc(var(--toast-offset-y)+var(--toast-index)*var(--toast-gap)+var(--toast-swipe-movement-y))]',
                'data-[position*=bottom]:[--toast-calc-offset-y:calc(var(--toast-offset-y)*-1+var(--toast-index)*var(--toast-gap)*-1+var(--toast-swipe-movement-y))]',
                // Default state transform
                'data-[position*=top]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--toast-peek))+(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]',
                'data-[position*=bottom]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--toast-peek))-(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]',
                // Limited state
                'data-limited:opacity-0',
                // Expanded state
                'data-expanded:h-(--toast-height)',
                'data-position:data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-calc-offset-y))]',
                // Starting and ending animations
                'data-[position*=top]:data-starting-style:transform-[translateY(calc(-100%-var(--toast-inset)))]',
                'data-[position*=bottom]:data-starting-style:transform-[translateY(calc(100%+var(--toast-inset)))]',
                'data-ending-style:opacity-0',
                // Ending animations (direction-aware)
                'data-ending-style:not-data-limited:not-data-swipe-direction:transform-[translateY(calc(100%+var(--toast-inset)))]',
                'data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
                'data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
                'data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]',
                'data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]',
                // Ending animations (expanded)
                'data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
                'data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
                'data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]',
                'data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]'
              )}
              data-position={position}
              key={toast.id}
              swipeDirection={
                position.includes('center')
                  ? [isTop ? 'up' : 'down']
                  : position.includes('left')
                    ? ['left', isTop ? 'up' : 'down']
                    : ['right', isTop ? 'up' : 'down']
              }
              toast={toast}
            >
              <Toast.Content className="pointer-events-auto relative px-3.5 py-3 text-sm transition-opacity duration-250 data-behind:pointer-events-none data-behind:opacity-0 data-expanded:opacity-100">
                {/* Close button - top right */}
                <Toast.Close
                  aria-label="Close notification"
                  className="absolute right-2 top-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  data-slot="toast-close"
                >
                  <XIcon className="h-4 w-4" />
                </Toast.Close>

                {/* Main content */}
                <div className="flex min-w-0 gap-2">
                  {Icon && (
                    <div
                      className="shrink-0 [&>svg]:h-lh [&>svg]:w-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                      data-slot="toast-icon"
                    >
                      <Icon className="in-data-[type=loading]:animate-spin in-data-[type=error]:text-destructive in-data-[type=info]:text-info in-data-[type=success]:text-success in-data-[type=warning]:text-warning in-data-[type=loading]:opacity-80" />
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Toast.Title className="font-medium" data-slot="toast-title" />
                    <Toast.Description
                      className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-3.5 text-muted-foreground"
                      data-slot="toast-description"
                    />
                  </div>
                </div>

                {/* Bottom actions */}
                {((toast.actions?.length ?? 0) > 0 ||
                  toast.actionProps ||
                  toast.type === 'error') && (
                  <div
                    className="mt-2 flex items-center justify-end gap-1"
                    data-slot="toast-actions"
                  >
                    {(toast.actions?.length ?? 0) > 0 &&
                      toast.actions?.map((action) => (
                        <Toast.Action
                          key={action.label?.toString() ?? Math.random()}
                          className={buttonVariants({
                            size: 'xs',
                            variant: action.variant ?? 'default',
                          })}
                          data-slot="toast-action"
                          onClick={(event) => {
                            action.onClick?.();
                            toast.onClose?.(event);
                          }}
                        >
                          {action.label}
                        </Toast.Action>
                      ))}

                    {toast.actionProps && (
                      <Toast.Action
                        className={buttonVariants({ size: 'xs' })}
                        data-slot="toast-action"
                      >
                        {toast.actionProps.children}
                      </Toast.Action>
                    )}

                    {/* Send to Session button for error toasts */}
                    {toast.type === 'error' && (
                      <SendToSessionButton
                        title={toast.title as string}
                        description={toast.description as string | undefined}
                        onClose={() => toastManager.close(toast.id)}
                      />
                    )}
                  </div>
                )}
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AnchoredToastProvider({ children, ...props }: Toast.Provider.Props) {
  return (
    <Toast.Provider toastManager={anchoredToastManager} {...props}>
      {children}
      <AnchoredToasts />
    </Toast.Provider>
  );
}

function AnchoredToasts() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal data-slot="toast-portal-anchored">
      <Toast.Viewport className="outline-none" data-slot="toast-viewport-anchored">
        {toasts.map((toast) => {
          const Icon = toast.type ? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS] : null;
          const tooltipStyle = (toast.data as { tooltipStyle?: boolean })?.tooltipStyle ?? false;
          const positionerProps = toast.positionerProps;

          if (!positionerProps?.anchor) {
            return null;
          }

          return (
            <Toast.Positioner
              className="z-50 max-w-[min(--spacing(64),var(--available-width))]"
              data-slot="toast-positioner"
              key={toast.id}
              sideOffset={positionerProps.sideOffset ?? 4}
              toast={toast}
            >
              <Toast.Root
                className={cn(
                  'relative text-balance border bg-popover bg-clip-padding text-popover-foreground text-xs transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-clip-border dark:before:shadow-[0_-1px_--theme(--color-white/8%)]',
                  tooltipStyle
                    ? 'rounded-md shadow-black/5 shadow-md before:rounded-[calc(var(--radius-md)-1px)]'
                    : 'rounded-lg shadow-lg before:rounded-[calc(var(--radius-lg)-1px)]'
                )}
                data-slot="toast-popup"
                toast={toast}
              >
                {tooltipStyle ? (
                  <Toast.Content className="pointer-events-auto px-2 py-1">
                    <Toast.Title data-slot="toast-title" />
                  </Toast.Content>
                ) : (
                  <Toast.Content className="pointer-events-auto flex items-center justify-between gap-1.5 overflow-hidden px-3.5 py-3 text-sm">
                    <div className="flex gap-2">
                      {Icon && (
                        <div
                          className="[&>svg]:h-lh [&>svg]:w-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                          data-slot="toast-icon"
                        >
                          <Icon className="in-data-[type=loading]:animate-spin in-data-[type=error]:text-destructive in-data-[type=info]:text-info in-data-[type=success]:text-success in-data-[type=warning]:text-warning in-data-[type=loading]:opacity-80" />
                        </div>
                      )}

                      <div className="flex flex-col gap-0.5">
                        <Toast.Title className="font-medium" data-slot="toast-title" />
                        <Toast.Description
                          className="text-muted-foreground"
                          data-slot="toast-description"
                        />
                      </div>
                    </div>
                    {(toast.actions?.length ?? 0) > 0 && (
                      <div className="flex items-center gap-1" data-slot="toast-actions">
                        {toast.actions?.map((action) => (
                          <Toast.Action
                            key={action.label?.toString() ?? Math.random()}
                            className={buttonVariants({
                              size: 'xs',
                              variant: action.variant ?? 'default',
                            })}
                            data-slot="toast-action"
                            onClick={(event) => {
                              action.onClick?.();
                              toast.onClose?.(event);
                            }}
                          >
                            {action.label}
                          </Toast.Action>
                        ))}
                      </div>
                    )}

                    {toast.actionProps && (
                      <Toast.Action
                        className={buttonVariants({ size: 'xs' })}
                        data-slot="toast-action"
                      >
                        {toast.actionProps.children}
                      </Toast.Action>
                    )}
                  </Toast.Content>
                )}
              </Toast.Root>
            </Toast.Positioner>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

type ToastType = 'error' | 'warning' | 'success' | 'info' | 'loading';

type ToastAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
};

interface ToastOptions {
  type?: ToastType;
  title: string;
  description?: string;
  timeout?: number;
  actions?: ToastAction[];
  actionProps?: { children: React.ReactNode };
}

/**
 * Add a toast with smart timeout based on type.
 * - error/warning: 10s (longer for important messages)
 * - success/info: 5s (default)
 * - loading: no auto-dismiss
 */
function addToast(options: ToastOptions) {
  const defaultTimeouts: Record<ToastType, number> = {
    error: 10000,
    warning: 10000,
    loading: 0,
    success: 5000,
    info: 5000,
  };

  const timeout = options.timeout ?? (options.type ? defaultTimeouts[options.type] : 5000);

  return toastManager.add({
    ...options,
    timeout,
  });
}

export {
  ToastProvider,
  type ToastPosition,
  toastManager,
  addToast,
  AnchoredToastProvider,
  anchoredToastManager,
};

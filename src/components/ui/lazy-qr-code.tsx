"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type Ref,
} from "react";
import dynamic from "next/dynamic";
import type {
  QRCodeCanvas as QRCodeCanvasComponent,
  QRCodeSVG as QRCodeSVGComponent,
} from "qrcode.react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Drop-in, code-split replacements for `qrcode.react`'s `QRCodeSVG` and
 * `QRCodeCanvas` (#707). Same names, props and refs, so a call site only
 * changes its import path — but the QR encoder now loads in its own chunk the
 * first time a QR code is actually rendered, instead of shipping with every
 * page that merely contains a (usually closed) dialog.
 *
 * While the chunk loads, a skeleton of exactly `size` × `size` holds the spot,
 * so nothing moves when the real code paints.
 */

type QRCodeSVGProps = ComponentPropsWithoutRef<typeof QRCodeSVGComponent>;
type QRCodeCanvasProps = ComponentPropsWithoutRef<typeof QRCodeCanvasComponent>;

/** `qrcode.react`'s own default when `size` is omitted. */
const DEFAULT_SIZE = 128;

interface QRFrame {
  size: number;
  className?: string;
  style?: CSSProperties;
}

// `next/dynamic` gives its `loading` component no access to the props, so the
// wrapper hands the dimensions down through context instead of an extra
// element that could itself change the layout.
const QRFrameContext = createContext<QRFrame>({ size: DEFAULT_SIZE });

function QRCodeSkeleton() {
  const { size, className, style } = useContext(QRFrameContext);
  return (
    <Skeleton
      role="status"
      aria-busy="true"
      aria-label="Loading QR code"
      // A block box, like the <svg>/<canvas> it stands in for (Tailwind's
      // preflight makes both `display: block`), so the wrapper gains no line
      // height and keeps exactly the same height when the code paints.
      className={cn("rounded-none", className)}
      style={{ ...style, width: size, height: size }}
    />
  );
}

// `next/dynamic` drops `ref`, so it travels through as `forwardedRef` and is
// re-attached once the real component has loaded (GroupQRCode reads the SVG
// back through it to download the code).
const DynamicQRCodeSVG = dynamic(
  () =>
    import("qrcode.react").then(({ QRCodeSVG }) => {
      function LoadedQRCodeSVG({
        forwardedRef,
        ...props
      }: QRCodeSVGProps & { forwardedRef?: Ref<SVGSVGElement> }) {
        return <QRCodeSVG ref={forwardedRef} {...props} />;
      }
      return LoadedQRCodeSVG;
    }),
  // An SVG code renders fine on the server, so it keeps server rendering.
  { loading: QRCodeSkeleton }
);

const DynamicQRCodeCanvas = dynamic(
  () =>
    import("qrcode.react").then(({ QRCodeCanvas }) => {
      function LoadedQRCodeCanvas({
        forwardedRef,
        ...props
      }: QRCodeCanvasProps & { forwardedRef?: Ref<HTMLCanvasElement> }) {
        return <QRCodeCanvas ref={forwardedRef} {...props} />;
      }
      return LoadedQRCodeCanvas;
    }),
  // A canvas code is only ever painted in the browser (the server can emit
  // nothing but a blank <canvas>), so the skeleton is the honest SSR output.
  { ssr: false, loading: QRCodeSkeleton }
);

function frameOf(props: { size?: number; className?: string; style?: CSSProperties }): QRFrame {
  return {
    size: props.size ?? DEFAULT_SIZE,
    className: props.className,
    style: props.style,
  };
}

export const QRCodeSVG = forwardRef<SVGSVGElement, QRCodeSVGProps>(
  function QRCodeSVG(props, ref) {
    return (
      <QRFrameContext.Provider value={frameOf(props)}>
        <DynamicQRCodeSVG {...props} forwardedRef={ref} />
      </QRFrameContext.Provider>
    );
  }
);

export const QRCodeCanvas = forwardRef<HTMLCanvasElement, QRCodeCanvasProps>(
  function QRCodeCanvas(props, ref) {
    return (
      <QRFrameContext.Provider value={frameOf(props)}>
        <DynamicQRCodeCanvas {...props} forwardedRef={ref} />
      </QRFrameContext.Provider>
    );
  }
);

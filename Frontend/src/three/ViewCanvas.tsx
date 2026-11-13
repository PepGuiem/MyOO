import { View } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { setupRenderer } from './env';

/**
 * UN solo <Canvas> WebGL, fijo y del tamaño de la ventana, que pinta todas las
 * miniaturas 3D de la página (cada miniatura es un <View> de drei que marca un
 * hueco en el HTML). Los navegadores limitan el número de contextos WebGL
 * (~16), así que usar un Canvas por miniatura no escalaría.
 */
export function ViewCanvas() {
  return (
    <Canvas
      className="view-canvas"
      eventSource={document.getElementById('root') ?? undefined}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onCreated={setupRenderer}
      style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}
    >
      <View.Port />
    </Canvas>
  );
}

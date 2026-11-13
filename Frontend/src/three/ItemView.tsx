import { PerspectiveCamera, View } from '@react-three/drei';
import type { GarmentLike } from '../api/types';
import { Fit, GarmentModel, StudioLights, Turntable } from './GarmentModel';

/** Miniatura 3D de una prenda (se pinta en el ViewCanvas compartido). */
export function ItemView({ garment, active, className }: { garment: GarmentLike; active: boolean; className?: string }) {
  return (
    <View className={className}>
      <PerspectiveCamera makeDefault position={[0, 0, 3.4]} fov={32} />
      <StudioLights />
      <Turntable active={active}>
        <Fit size={1.45}>
          <GarmentModel garment={garment} presentation />
        </Fit>
      </Turntable>
    </View>
  );
}

import { AudiomSource } from "../../../../shared/audiom-client/AudiomSource";
import { AudiomEmbedConfig } from "../../../../shared/audiom-client/AudiomEmbedConfig";
import { StepSize } from "../../../../shared/audiom-client/StepSize";
import { IAudiomConfig } from "../setting/types";

export function audiomConfigToEmbedConfig(config: IAudiomConfig): AudiomEmbedConfig {
  const sources: AudiomSource[] = [];

  return AudiomEmbedConfig.dynamic({
    apiKey: config.apiKey || '',
    sources: sources,
    center: [config.centerLongitude || 0, config.centerLatitude || 0],
    showVisualMap: config.showVisualMap ?? true,
    showHeading: config.showHeading ?? false,
    zoom: config.zoom ?? 10,
    heading: config.heading,
    stepSize: StepSize.Kilometers(config.stepSize ?? 1),
  });
}

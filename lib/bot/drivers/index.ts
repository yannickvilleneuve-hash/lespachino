import type { Platform, PlatformDriver } from "@/lib/bot/types";
import { FatalError } from "@/lib/bot/types";
import { facebookDriver } from "@/lib/bot/drivers/facebook";

function notImplemented(platform: Platform): PlatformDriver {
  const fail = (): never => {
    throw new FatalError(`driver not implemented: ${platform}`);
  };
  return {
    platform,
    checkSession: async () => fail(),
    publish: async () => fail(),
    update: async () => fail(),
    remove: async () => fail(),
  };
}

export const DRIVERS: Record<Platform, PlatformDriver> = {
  facebook: facebookDriver,
  kijiji: notImplemented("kijiji"),
  autotrader: notImplemented("autotrader"),
};

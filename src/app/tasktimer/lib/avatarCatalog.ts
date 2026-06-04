export type AvatarOption = { id: string; src: string; label: string };

const BUNDLED_AVATAR_WEBP_DIR_PATTERN = "toons|bottts|action-heroes";

export function normalizeBundledAvatarWebpSrc(src: string): string {
  const value = String(src || "").trim();
  if (!value || /^(?:data:|blob:|https?:\/\/|file:)/i.test(value)) return value;
  return value.replace(
    new RegExp(`(^|/)(avatars/(?:${BUNDLED_AVATAR_WEBP_DIR_PATTERN})/[^?#]+?)\\.(?:svg|png|jpe?g|gif)(?=([?#]|$))`, "i"),
    "$1$2.webp"
  );
}

export const normalizeToonAvatarWebpSrc = normalizeBundledAvatarWebpSrc;

export const AVATAR_CATALOG: AvatarOption[] = [
  { id: "action-heroes/bruce-lee", src: "/avatars/action-heroes/bruce-lee.webp", label: "Bruce Lee" },
  { id: "action-heroes/commando", src: "/avatars/action-heroes/commando.webp", label: "Commando" },
  { id: "action-heroes/iron-warden", src: "/avatars/action-heroes/iron-warden.webp", label: "Iron Warden" },
  { id: "action-heroes/lara-croft", src: "/avatars/action-heroes/lara-croft.webp", label: "Lara Croft" },
  { id: "action-heroes/rambo", src: "/avatars/action-heroes/rambo.webp", label: "Rambo" },
  { id: "action-heroes/robocop", src: "/avatars/action-heroes/robocop.webp", label: "Robocop" },
  { id: "action-heroes/t-1000", src: "/avatars/action-heroes/t-1000.webp", label: "T 1000" },
  { id: "bottts/bottts-1777441132037", src: "/avatars/bottts/bottts-1777441132037.webp", label: "Bottts 01" },
  { id: "bottts/bottts-1777442377436", src: "/avatars/bottts/bottts-1777442377436.webp", label: "Bottts 02" },
  { id: "bottts/bottts-1777442388888", src: "/avatars/bottts/bottts-1777442388888.webp", label: "Bottts 03" },
  { id: "bottts/bottts-1777442393598", src: "/avatars/bottts/bottts-1777442393598.webp", label: "Bottts 04" },
  { id: "bottts/bottts-1777442397847", src: "/avatars/bottts/bottts-1777442397847.webp", label: "Bottts 05" },
  { id: "bottts/bottts-1777442402287", src: "/avatars/bottts/bottts-1777442402287.webp", label: "Bottts 06" },
  { id: "bottts/bottts-1777442409477", src: "/avatars/bottts/bottts-1777442409477.webp", label: "Bottts 07" },
  { id: "bottts/bottts-1777442414568", src: "/avatars/bottts/bottts-1777442414568.webp", label: "Bottts 08" },
  { id: "bottts/bottts-1777442420083", src: "/avatars/bottts/bottts-1777442420083.webp", label: "Bottts 09" },
  { id: "bottts/bottts-1777442424639", src: "/avatars/bottts/bottts-1777442424639.webp", label: "Bottts 10" },
  { id: "bottts/bottts-1777442428930", src: "/avatars/bottts/bottts-1777442428930.webp", label: "Bottts 11" },
  { id: "bottts/bottts-1777442465196", src: "/avatars/bottts/bottts-1777442465196.webp", label: "Bottts 12" },
  { id: "bottts/bottts-1777442470237", src: "/avatars/bottts/bottts-1777442470237.webp", label: "Bottts 13" },
  { id: "bottts/bottts-1777442473919", src: "/avatars/bottts/bottts-1777442473919.webp", label: "Bottts 14" },
  { id: "bottts/bottts-1777442478077", src: "/avatars/bottts/bottts-1777442478077.webp", label: "Bottts 15" },
  { id: "bottts/bottts-1777442482233", src: "/avatars/bottts/bottts-1777442482233.webp", label: "Bottts 16" },
  { id: "toons/Bugs-Bunny", src: "/avatars/toons/Bugs-Bunny.webp", label: "Bugs Bunny" },
  { id: "toons/Close-up-Taz", src: "/avatars/toons/Close-up-Taz.webp", label: "Close Up Taz" },
  { id: "toons/Daffy-Duck", src: "/avatars/toons/Daffy-Duck.webp", label: "Daffy Duck" },
  { id: "toons/Marvin", src: "/avatars/toons/Marvin.webp", label: "Marvin" },
  { id: "toons/Pepe", src: "/avatars/toons/Pepe.webp", label: "Pepe" },
  { id: "toons/Porky-Pig-Concerned", src: "/avatars/toons/Porky-Pig-Concerned.webp", label: "Porky Pig Concerned" },
  { id: "toons/Roadrunner-With-Tongue-Out", src: "/avatars/toons/Roadrunner-With-Tongue-Out.webp", label: "Roadrunner With Tongue Out" },
  { id: "toons/Sylvester", src: "/avatars/toons/Sylvester.webp", label: "Sylvester" },
  { id: "toons/Tweety-2", src: "/avatars/toons/Tweety-2.webp", label: "Tweety 2" },
  { id: "toons/Yosemite-Sam", src: "/avatars/toons/Yosemite-Sam.webp", label: "Yosemite Sam" },
  { id: "toons/toon-01-cap-glasses", src: "/avatars/toons/toon-01-cap-glasses.webp", label: "Cap Glasses" },
  { id: "toons/toon-02-brown-hair", src: "/avatars/toons/toon-02-brown-hair.webp", label: "Brown Hair" },
  { id: "toons/toon-03-blonde-hair", src: "/avatars/toons/toon-03-blonde-hair.webp", label: "Blonde Hair" },
  { id: "toons/toon-04-pink-hair", src: "/avatars/toons/toon-04-pink-hair.webp", label: "Pink Hair" },
  { id: "toons/toon-05-orange-shirt", src: "/avatars/toons/toon-05-orange-shirt.webp", label: "Orange Shirt" },
  { id: "toons/toon-06-suit", src: "/avatars/toons/toon-06-suit.webp", label: "Suit" },
  { id: "toons/toon-07-green-shirt", src: "/avatars/toons/toon-07-green-shirt.webp", label: "Green Shirt" },
  { id: "toons/toon-08-pink-cap", src: "/avatars/toons/toon-08-pink-cap.webp", label: "Pink Cap" },
  { id: "toons/toon-09-hoop-earrings", src: "/avatars/toons/toon-09-hoop-earrings.webp", label: "Hoop Earrings" },
  { id: "toons/toonHead-male", src: "/avatars/toons/toonHead-male.webp", label: "ToonHead Male" },
];


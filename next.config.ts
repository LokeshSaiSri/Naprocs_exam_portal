import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server serve HMR/dev assets when accessed through an ngrok
  // tunnel (needed for testing the real webcam flow from another laptop) --
  // dev-only; production builds don't have this cross-origin restriction.
  allowedDevOrigins: ["avid-lake-snowbird.ngrok-free.dev"],
};

export default nextConfig;

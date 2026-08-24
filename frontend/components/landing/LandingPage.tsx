import { LandingNav } from "./LandingNav";
import { Hero } from "./Hero";
import { ProductPreview } from "./ProductPreview";
import { Problem } from "./Problem";
import { HowItWorks } from "./HowItWorks";
import { WhatYouGet } from "./WhatYouGet";
import { FinalCta } from "./FinalCta";
import { LandingFooter } from "./LandingFooter";

export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingNav />
      <Hero />
      {/* Directly under the hero on purpose: the graph is the one thing that
          explains the product faster than any paragraph can. */}
      <ProductPreview />
      <Problem />
      <HowItWorks />
      <WhatYouGet />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

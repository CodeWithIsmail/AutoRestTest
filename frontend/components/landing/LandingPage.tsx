import { LandingNav } from "./LandingNav";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";
import { ProductPreview } from "./ProductPreview";
import { FinalCta } from "./FinalCta";
import { LandingFooter } from "./LandingFooter";

export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingNav />
      <Hero />
      <HowItWorks />
      <Features />
      <ProductPreview />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

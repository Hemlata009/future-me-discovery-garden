import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ReferredDiscoveryAction({
  referralCode,
  utmSource,
  utmMedium,
  utmCampaign,
}: {
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}) {
  if (!referralCode) return null;

  return (
    <Button asChild variant="premium">
      <Link
        to="/discover"
        search={{
          ref: referralCode,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        }}
      >
        Try it yourself - 5 minutes <ArrowRight />
      </Link>
    </Button>
  );
}

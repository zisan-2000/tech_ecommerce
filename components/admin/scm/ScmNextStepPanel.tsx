"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";

type ActionItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary" | "destructive";
};

type ScmNextStepPanelProps = {
  title: string;
  subtitle: string;
  actions: ActionItem[];
  emptyMessage: string;
  children?: React.ReactNode;
};

export function ScmNextStepPanel({
  title,
  subtitle,
  actions,
  emptyMessage,
  children,
}: ScmNextStepPanelProps) {
  return (
    <Card className="xl:sticky xl:top-24">
      <CardHeader>
        <CardTitle>Next Action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScmSectionHeader title={title} description={subtitle} />
        {children}
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {actions.map((action) => (
              <Button
                key={action.key}
                className="w-full justify-start"
                variant={action.variant || "default"}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

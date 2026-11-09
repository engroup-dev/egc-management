import React, { useState } from "react";
import Button from "../../ui/Button";
import BOQPDFOptionsDialog from "./BOQPDFOptionsDialog";
import { useBOQPDFGenerate } from "../../../hooks/operations/boq/useBOQPDFGenerate";
import { BOQReportRequest } from "../../../hooks/operations/boq/boqPdfPayload";
import { WorkFull } from "../../../hooks/operations/boq/types";
import { BOQType } from "../../../hooks/operations/boq/useTypes";
import { Zone } from "../../../hooks/operations/boq/useZones";
type BOQPDFDialogButtonProps = {
  project: { name: string };
  currentType: BOQType;
  allTypes: BOQType[];
  works: WorkFull[];
  zones: Zone[];
};

const BOQPDFDialogButton: React.FC<BOQPDFDialogButtonProps> = ({
  project,
  currentType,
  allTypes,
  works,
  zones,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { generate, loading, error } = useBOQPDFGenerate();

  const handleConfirm = async (payload: BOQReportRequest) => {
    setIsOpen(false);
    await generate(payload);
  };

  return (
    <div>
      <Button
        size="sm"
        variant="primary-light"
        className="gap-1"
        onClick={() => setIsOpen(true)}
        disabled={loading}
      >
        {loading ? "جاري الانشاء..." : "طباعة تقرير"}
      </Button>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}

      <BOQPDFOptionsDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleConfirm}
        currentType={currentType}
        allTypes={allTypes}
        works={works}
        zones={zones}
        projectName={project.name}
      />
    </div>
  );
};

export default BOQPDFDialogButton;

import { nextAssetId, type Asset } from "@/lib/assets/types";
import { fileLabel, importImageFile } from "@/lib/images/import";

/**
 * Turn a dropped, pasted or chosen file into a project asset.
 *
 * Shared by the landing composer and the studio composer so an image imported before
 * the first turn and one imported on the fifth are the same kind of thing, with the
 * same ids, and the design agent cannot tell them apart.
 */
export async function importAsset(file: File, existing: Asset[]): Promise<Asset> {
  const imported = await importImageFile(file);

  // Alpha in the source means the user already has a cutout, so it is treated as
  // layerable art from the start rather than after an enhancement pass.
  const kind = imported.hasAlpha ? "cutout" : "photo";
  const label = fileLabel(file.name);

  return {
    id: nextAssetId(existing),
    label,
    kind,
    description: "",
    dataUri: imported.dataUri,
    width: imported.width,
    height: imported.height,
    original: {
      dataUri: imported.dataUri,
      description: "",
      width: imported.width,
      height: imported.height,
      kind,
    },
  };
}

const IMAGE_TYPE = /^image\//;

export function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => IMAGE_TYPE.test(file.type));
}

export function imageFilesFromTransfer(items: DataTransferItemList | undefined): File[] {
  const files: File[] = [];
  for (const item of Array.from(items ?? [])) {
    if (item.kind !== "file" || !IMAGE_TYPE.test(item.type)) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

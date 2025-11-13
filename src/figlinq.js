(function() {
  // Memory: Map filename to fileObj for tracking opened files
  const fileMemory = new Map();

  async function insertFileMenuItems() {
    const getMenuUl = () =>
      document.querySelector(
        "#cheerpjDisplay>.window>div.menuBar>.menu>.menuItem:nth-child(1)>ul"
      );
    if (!window.ij || !getMenuUl()) {
      setTimeout(insertFileMenuItems, 300);
      return;
    }
    const ij = window.ij;
    try {
      let menuUl = getMenuUl();
      if (!menuUl) return;
      const labels = Array.from(menuUl.children).map(
        (li) =>
          (li.querySelector("a") && li.querySelector("a").textContent) || ""
      );

      // Helpers
      const ensureExtension = (name, ext) => {
        if (!name) return `image${ext}`;
        const i = name.lastIndexOf(".");
        if (i > 0) return name.substring(0, i) + ext;
        return name + ext;
      };
      const pngBytesToJpegBlob = (arrayBuffer, quality = 0.9, bg = "#ffffff") =>
        new Promise((resolve, reject) => {
          try {
            const img = new Image();
            const url = URL.createObjectURL(
              new Blob([arrayBuffer], { type: "image/png" })
            );
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                  (blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob)
                      return reject(new Error("Failed to create JPEG blob"));
                    resolve(blob);
                  },
                  "image/jpeg",
                  quality
                );
              } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
              }
            };
            img.onerror = (e) => {
              URL.revokeObjectURL(url);
              reject(e);
            };
            img.src = url;
          } catch (e) {
            reject(e);
          }
        });

      // Add: Save to Figlinq (submenu)
      if (!labels.includes("Save to Figlinq")) {
        const liSave = document.createElement("li");
        liSave.classList.add("menuItem", "subMenuItem");

        const aSave = document.createElement("a");
        aSave.textContent = "Save to Figlinq";
        liSave.appendChild(aSave);

        const arrow = document.createElement("span");
        arrow.classList.add("arrow");
        arrow.textContent = "▶";
        liSave.appendChild(arrow);

        const ulSub = document.createElement("ul");
        ulSub.classList.add("subMenu");

        // Subitem: Save as .png
        const liPng = document.createElement("li");
        liPng.classList.add("menuItem");
        const aPng = document.createElement("a");
        aPng.textContent = "Save as .png";
        liPng.appendChild(aPng);
        liPng.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            const imp = await ij.getImage();
            if (!imp) throw new Error("No active image");
            const baseName = cjStringJavaToJs(await cjCall(imp, "getTitle"));
            const filename = ensureExtension(baseName, ".png");
            const javaBytes = await ij.saveAsBytes(imp, "png");
            const arrayBuffer = javaBytes.slice(1).buffer;
            const blob = new Blob([arrayBuffer], { type: "image/png" });

            const handleFiglinqSaveMessage = (event) => {
              if (
                event.data &&
                (event.data.type === "figlinq-file-saved" ||
                  event.data.type === "figlinq-save-cancelled")
              ) {
                window.removeEventListener("message", handleFiglinqSaveMessage);
              }
            };
            window.addEventListener("message", handleFiglinqSaveMessage);
            window.parent.postMessage(
              {
                action: "upload-file",
                filename,
                imageData: blob,
                imageType: "image/png",
              },
              "*"
            );
          } catch (error) {
            console.error("Failed to save image to Figlinq:", error);
          }
        };

        // Subitem: Save as jpg (90% compression)
        const liJpg = document.createElement("li");
        liJpg.classList.add("menuItem");
        const aJpg = document.createElement("a");
        aJpg.textContent = "Save as jpg (90% compression)";
        liJpg.appendChild(aJpg);
        liJpg.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            const imp = await ij.getImage();
            if (!imp) throw new Error("No active image");
            const baseName = cjStringJavaToJs(await cjCall(imp, "getTitle"));
            const filename = ensureExtension(baseName, ".jpg");

            // Get PNG bytes then convert to JPEG at 90%
            const javaBytes = await ij.saveAsBytes(imp, "png");
            const arrayBuffer = javaBytes.slice(1).buffer;
            const jpegBlob = await pngBytesToJpegBlob(arrayBuffer, 0.9);

            const handleFiglinqSaveMessage = (event) => {
              if (
                event.data &&
                (event.data.type === "figlinq-file-saved" ||
                  event.data.type === "figlinq-save-cancelled")
              ) {
                window.removeEventListener("message", handleFiglinqSaveMessage);
              }
            };
            window.addEventListener("message", handleFiglinqSaveMessage);
            window.parent.postMessage(
              {
                action: "upload-file",
                filename,
                imageData: jpegBlob,
                imageType: "image/jpeg",
              },
              "*"
            );
          } catch (error) {
            console.error("Failed to save image to Figlinq:", error);
          }
        };

        ulSub.appendChild(liPng);
        ulSub.appendChild(liJpg);
        liSave.appendChild(ulSub);

        menuUl.insertBefore(liSave, menuUl.firstChild);
      }

      // Add: Update file in Figlinq
      if (!labels.includes("Update file in Figlinq")) {
        const liUpdate = document.createElement("li");
        liUpdate.classList.add("menuItem", "subMenuItem");
        const aUpdate = document.createElement("a");
        aUpdate.textContent = "Update file in Figlinq";
        liUpdate.appendChild(aUpdate);
        liUpdate.onclick = async () => {
          try {
            const imp = await ij.getImage();
            if (!imp) throw new Error("No active image");
            const baseName = cjStringJavaToJs(await cjCall(imp, "getTitle"));

            // Check if we have a fileObj for this filename
            const fileObj = fileMemory.get(baseName);
            if (!fileObj) {
              console.error("No fileObj found for:", baseName);
              alert(
                "This file was not opened from Figlinq. Use 'Save to Figlinq' instead."
              );
              return;
            }

            // Determine format from filename
            const isJpg =
              baseName.toLowerCase().endsWith(".jpg") ||
              baseName.toLowerCase().endsWith(".jpeg");
            const isPng = baseName.toLowerCase().endsWith(".png");

            let imageData, imageType;

            if (isJpg) {
              // Convert to JPEG at 90%
              const javaBytes = await ij.saveAsBytes(imp, "png");
              const arrayBuffer = javaBytes.slice(1).buffer;
              imageData = await pngBytesToJpegBlob(arrayBuffer, 0.9);
              imageType = "image/jpeg";
            } else {
              // Default to PNG
              const javaBytes = await ij.saveAsBytes(imp, "png");
              const arrayBuffer = javaBytes.slice(1).buffer;
              imageData = new Blob([arrayBuffer], { type: "image/png" });
              imageType = "image/png";
            }

            const handleFiglinqUpdateMessage = (event) => {
              if (
                event.data &&
                (event.data.type === "figlinq-file-updated" ||
                  event.data.type === "figlinq-update-cancelled")
              ) {
                window.removeEventListener(
                  "message",
                  handleFiglinqUpdateMessage
                );
              }
            };
            window.addEventListener("message", handleFiglinqUpdateMessage);
            window.parent.postMessage(
              {
                action: "update-file",
                filename: baseName,
                imageData: imageData,
                imageType: imageType,
                fileObj: fileObj,
              },
              "*"
            );
          } catch (error) {
            console.error("Failed to update file in Figlinq:", error);
          }
        };
        menuUl.insertBefore(liUpdate, menuUl.firstChild);
      }

      // Add: Load image from Figlinq
      if (!labels.includes("Load image from Figlinq")) {
        const liLoad = document.createElement("li");
        liLoad.classList.add("menuItem", "subMenuItem");
        const aLoad = document.createElement("a");
        aLoad.textContent = "Load image from Figlinq";
        liLoad.appendChild(aLoad);
        liLoad.onclick = async () => {
          const handleFiglinqMessage = async (event) => {
            if (event.data && event.data.type === "selected-figlinq-file") {
              window.removeEventListener("message", handleFiglinqMessage);
              const file = event.data.file;
              const fileObj = event.data.fileObj;
              if (!file) return; // user cancelled
              try {
                const name = file.name || "image";
                const filepath = "/str/" + name;
                const buffer = await (file.arrayBuffer
                  ? file.arrayBuffer()
                  : new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = reject;
                      reader.readAsArrayBuffer(file);
                    }));
                cheerpjAddStringFile(filepath, new Uint8Array(buffer));
                await ij.open(filepath).finally(() => {
                  try {
                    cheerpjRemoveStringFile(filepath);
                  } catch (e) {
                    /* noop */
                  }
                });

                // Store fileObj in memory if provided
                if (fileObj) {
                  fileMemory.set(name, fileObj);
                  console.log("[ImageJ iframe] Stored fileObj for:", name);
                }
              } catch (e) {
                console.error("Failed to load selected Figlinq file:", e);
              }
            }
          };
          window.addEventListener("message", handleFiglinqMessage);
          window.parent.postMessage({ action: "select-figlinq-file" }, "*");
        };
        menuUl.insertBefore(liLoad, menuUl.firstChild);
      }

      // Add '-' separator (after the two inserted items)
      menuUl = getMenuUl();
      if (menuUl && menuUl.children.length >= 2) {
        const liSep = document.createElement("li");
        liSep.classList.add("menuItem");
        const aSep = document.createElement("a");
        aSep.innerHTML = "-";
        liSep.appendChild(aSep);
        // Insert at index 2 to come after our two new items
        menuUl.insertBefore(liSep, menuUl.children[2]);
      }
    } catch (e) {
      console.error("Failed to add Figlinq menu items:", e);
    }
  }
  insertFileMenuItems();

  // Global message listener for receiving files from parent window (for fid parameter only)
  async function handleParentMessage(event) {
    console.log("[ImageJ iframe] Received message:", event.data);

    if (!event.data) {
      console.log("[ImageJ iframe] No event.data, ignoring");
      return;
    }

    // Only handle messages that are specifically for fid parameter loading
    // (messages with fromFidParameter flag)
    if (event.data.type !== "selected-figlinq-file" || !event.data.fromFidParameter) {
      console.log(
        "[ImageJ iframe] Message not for fid parameter loading, ignoring"
      );
      return;
    }

    console.log("[ImageJ iframe] Received 'selected-figlinq-file' message from fid parameter");

    const file = event.data.file;
    const fileObj = event.data.fileObj;
    if (!file) {
      console.log(
        "[ImageJ iframe] No file in message, user cancelled or no file provided"
      );
      return;
    }

    console.log(
      "[ImageJ iframe] File received:",
      file.name,
      "size:",
      file.size,
      "type:",
      file.type
    );

    if (!window.ij) {
      console.log("[ImageJ iframe] ImageJ not ready yet, retrying in 300ms");
      setTimeout(() => handleParentMessage(event), 300);
      return;
    }

    console.log("[ImageJ iframe] ImageJ ready, loading file into ImageJ");

    try {
      const name = file.name || "image";
      const filepath = "/str/" + name;
      console.log("[ImageJ iframe] Creating virtual file at:", filepath);

      const buffer = await (file.arrayBuffer
        ? file.arrayBuffer()
        : new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          }));

      console.log("[ImageJ iframe] File buffer size:", buffer.byteLength);
      cheerpjAddStringFile(filepath, new Uint8Array(buffer));
      console.log("[ImageJ iframe] Virtual file created, opening in ImageJ");

      await window.ij.open(filepath).finally(() => {
        try {
          cheerpjRemoveStringFile(filepath);
          console.log("[ImageJ iframe] Virtual file cleaned up");
        } catch (e) {
          console.log("[ImageJ iframe] Error cleaning up virtual file:", e);
        }
      });

      // Store fileObj in memory if provided
      if (fileObj) {
        fileMemory.set(name, fileObj);
        console.log("[ImageJ iframe] Stored fileObj for:", name, fileObj);
      }

      console.log(
        "[ImageJ iframe] Successfully loaded image from parent:",
        name
      );
    } catch (e) {
      console.error(
        "[ImageJ iframe] Failed to load file from parent window:",
        e
      );
    }
  }

  // Listen for messages from parent window (for fid parameter loading)
  window.addEventListener("message", handleParentMessage);

  // Request image from parent if fid parameter exists
  async function requestImageFromParent() {
    if (!window.ij) {
      console.log("[ImageJ iframe] ImageJ not ready yet, retrying in 300ms");
      setTimeout(requestImageFromParent, 300);
      return;
    }

    console.log(
      "[ImageJ iframe] ImageJ ready, asking parent if there's a fid parameter"
    );

    // Ask parent if there's a fid parameter to load
    window.parent.postMessage(
      {
        action: "imagej-ready-check-fid",
      },
      "*"
    );

    console.log("[ImageJ iframe] Sent imagej-ready-check-fid to parent");
  }

  requestImageFromParent();
})();

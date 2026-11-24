(() => {
    const shopInfo = Object.freeze({
        name: "Pabitra's Online Services",
        business: "Online Mobile Wholesale",
        address: "Arambagh Link Road, West Bengal",
        mobile: "9933601872",
    });
    const currency = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
    });
    const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    let fontPromise;
    let logoPromise;

    function underThousand(value) {
        const words = [];
        if (value >= 100) {
            words.push(`${ones[Math.floor(value / 100)]} Hundred`);
            value %= 100;
        }
        if (value >= 20) {
            words.push(tens[Math.floor(value / 10)]);
            value %= 10;
        } else if (value >= 10) {
            words.push(teens[value - 10]);
            value = 0;
        }
        if (value > 0) words.push(ones[value]);
        return words.join(" ");
    }

    function integerInWords(value) {
        if (value === 0) return "Zero";
        const groups = [
            [1000000000, "Arab"],
            [10000000, "Crore"],
            [100000, "Lakh"],
            [1000, "Thousand"],
            [100, "Hundred"],
        ];
        const words = [];
        for (const [divisor, label] of groups) {
            if (value >= divisor) {
                const group = Math.floor(value / divisor);
                words.push(`${underThousand(group)} ${label}`);
                value %= divisor;
            }
        }
        if (value > 0) words.push(underThousand(value));
        return words.join(" ");
    }

    function amountInWords(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0 || amount > 99999999999) {
            throw new RangeError("Amount must be between zero and 99,999,999,999 rupees.");
        }
        const paiseTotal = Math.round((amount + Number.EPSILON) * 100);
        const rupees = Math.floor(paiseTotal / 100);
        const paise = paiseTotal % 100;
        return `Rupees ${integerInWords(rupees)}${paise ? ` and Paise ${integerInWords(paise)}` : ""} Only`;
    }

    async function getPdfFont() {
        if (!fontPromise) {
            fontPromise = fetch("/vendor/fonts/NotoSans-Variable.ttf").then(async (response) => {
                if (!response.ok) throw new Error(`Could not load the PDF font (${response.status})`);
                const bytes = new Uint8Array(await response.arrayBuffer());
                let binary = "";
                for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
                }
                return btoa(binary);
            });
        }
        return fontPromise;
    }

    function getLogo() {
        if (!logoPromise) {
            logoPromise = new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const scale = Math.min(1, 480 / image.naturalWidth);
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(image.naturalWidth * scale);
                    canvas.height = Math.round(image.naturalHeight * scale);
                    const context = canvas.getContext("2d");
                    if (!context) {
                        reject(new Error("Could not prepare the shop logo for the PDF."));
                        return;
                    }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/png"));
                };
                image.onerror = () => reject(new Error("Could not load the shop logo."));
                image.src = "/icons/pb-ledger.svg";
            });
        }
        return logoPromise;
    }

    function dateLabel(value) {
        if (!value) return "—";
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(date);
    }

    function drawInvoicePair(doc, label, value, x, y, width, valueColor) {
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        doc.setTextColor(102, 119, 134);
        doc.text(label, x, y);
        doc.setFont("NotoSans", "normal");
        doc.setTextColor(...valueColor);
        doc.text(String(value || "—"), x + width, y, { align: "right" });
    }

    async function createDocument(bill) {
        if (!bill || !Array.isArray(bill.items) || bill.items.length === 0) {
            throw new Error("This bill has no items to export.");
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ format: "a4", unit: "mm" });
        const [font, logo] = await Promise.all([getPdfFont(), getLogo()]);
        doc.addFileToVFS("NotoSans.ttf", font);
        doc.addFont("NotoSans.ttf", "NotoSans", "normal");
        doc.addFont("NotoSans.ttf", "NotoSans", "bold");
        doc.setFont("NotoSans", "normal");

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 18;
        const contentWidth = pageWidth - margin * 2;
        const ink = [25, 39, 58];
        const muted = [102, 119, 134];
        const line = [215, 224, 231];
        const brand = [20, 122, 85];
        const brandDark = [16, 59, 45];
        const pale = [246, 249, 250];
        const gold = [226, 182, 78];
        const amber = [170, 82, 37];
        const amount = Number(bill.total);
        const calculatedTotal = bill.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const total = Number.isFinite(amount) ? amount : calculatedTotal;
        const paidValue = Number(bill.paid ?? 0);
        const paid = Number.isFinite(paidValue) ? paidValue : 0;
        const dueValue = Number(bill.due);
        const due = Number.isFinite(dueValue) ? dueValue : total - paid;
        doc.setProperties({
            title: `${shopInfo.name} - Bill ${bill.billNo}`,
            subject: `Bill ${bill.billNo}`,
        });

        doc.setDrawColor(...brand);
        doc.setLineWidth(1.1);
        doc.line(margin, 12, pageWidth - margin, 12);
        doc.setDrawColor(...gold);
        doc.setLineWidth(0.35);
        doc.line(margin, 14, pageWidth - margin, 14);
        doc.addImage(logo, "PNG", margin, 19, 17, 17);
        doc.setTextColor(...ink);
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(15);
        doc.text(shopInfo.name, margin + 22, 24);
        doc.setTextColor(...brand);
        doc.setFontSize(8);
        doc.text(shopInfo.business.toUpperCase(), margin + 22, 30);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(shopInfo.address, margin + 22, 35);
        doc.text(`Mobile: ${shopInfo.mobile}`, margin + 22, 40);
        doc.setFont("NotoSans", "bold");
        doc.setTextColor(...ink);
        doc.setFontSize(20);
        doc.text("INVOICE", pageWidth - margin, 24, { align: "right" });
        doc.setFontSize(9);
        doc.setTextColor(...brand);
        doc.text(`Bill No: ${bill.billNo}`, pageWidth - margin, 32, { align: "right" });
        doc.setDrawColor(...line);
        doc.setLineWidth(0.35);
        doc.line(margin, 47, pageWidth - margin, 47);

        const metaY = 53;
        const leftWidth = contentWidth / 2;
        const rightX = margin + leftWidth;
        const addressWidth = leftWidth - 8;
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        const addressLines = doc.splitTextToSize(String(bill.customerAddress || "—").replace(/\s+/g, " ").trim(), addressWidth);
        const addressTop = 20;
        const addressLineHeight = 4.2;
        const phoneOffset = addressTop + addressLines.length * addressLineHeight + 1;
        const metaHeight = Math.max(34, phoneOffset + 5);
        doc.setFillColor(...pale);
        doc.setDrawColor(...line);
        doc.roundedRect(margin, metaY, contentWidth, metaHeight, 1.5, 1.5, "FD");
        doc.line(rightX, metaY, rightX, metaY + metaHeight);

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("BILL TO", margin + 4, metaY + 6);
        doc.text("INVOICE DETAILS", rightX + 4, metaY + 6);
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...ink);
        doc.text(String(bill.customerName || "—"), margin + 4, metaY + 14);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...ink);
        doc.text(addressLines, margin + 4, metaY + addressTop);
        doc.text(`Mobile: ${bill.customerMobile || "—"}`, margin + 4, metaY + phoneOffset);

        const detailWidth = leftWidth - 8;
        drawInvoicePair(doc, "Bill No.", bill.billNo, rightX + 4, metaY + 14, detailWidth - 4, ink);
        drawInvoicePair(doc, "Bill Date", dateLabel(bill.billDate), rightX + 4, metaY + 21, detailWidth - 4, ink);
        if (bill.dueDate) {
            drawInvoicePair(doc, "Payment Due Date", dateLabel(bill.dueDate), rightX + 4, metaY + 28, detailWidth - 4, amber);
        }

        doc.autoTable({
            startY: metaY + metaHeight + 6,
            margin: { left: margin, right: margin, top: 18, bottom: 52 },
            head: [["#", "PRODUCT NAME", "PRODUCT CODE", "IMEI NUMBER", "AMOUNT (₹)"]],
            body: bill.items.map((item, index) => [
                String(index + 1),
                item.productName || "—",
                item.productCode || "—",
                item.imei || "—",
                currency.format(Number(item.amount) || 0),
            ]),
            theme: "grid",
            styles: {
                font: "NotoSans",
                fontStyle: "normal",
                fontSize: 7.8,
                cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
                overflow: "linebreak",
                lineColor: line,
                lineWidth: 0.15,
                textColor: ink,
                valign: "middle",
            },
            headStyles: {
                fillColor: brandDark,
                textColor: [255, 255, 255],
                font: "NotoSans",
                fontStyle: "normal",
                fontSize: 7.5,
                lineColor: brand,
                lineWidth: 0.45,
            },
            alternateRowStyles: {
                fillColor: pale,
            },
            columnStyles: {
                0: { cellWidth: 10, halign: "center" },
                1: { cellWidth: 59 },
                2: { cellWidth: 28, font: "NotoSans", fontStyle: "bold" },
                3: { cellWidth: 42, font: "NotoSans", fontSize: 7.2 },
                4: { cellWidth: 35, halign: "right" },
            },
        });

        const wordsWidth = 94;
        const totalsWidth = contentWidth - wordsWidth - 5;
        const totalsX = margin + wordsWidth + 5;
        const amountWordsLines = doc.splitTextToSize(amountInWords(total), wordsWidth - 10);
        const wordsHeight = Math.max(17, 10 + amountWordsLines.length * 4.2);
        let summaryY = doc.lastAutoTable.finalY + 7;
        if (summaryY + 53 > pageHeight - 22) {
            doc.addPage();
            summaryY = margin + 8;
        }

        doc.setFillColor(...pale);
        doc.rect(margin, summaryY, wordsWidth, wordsHeight, "F");
        doc.setFillColor(...brand);
        doc.rect(margin, summaryY, 1.2, wordsHeight, "F");
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...muted);
        doc.text("AMOUNT IN WORDS", margin + 4, summaryY + 5.5);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...ink);
        doc.text(amountWordsLines, margin + 4, summaryY + 11);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("Total Quantity:", margin, summaryY + wordsHeight + 6);
        doc.setFont("NotoSans", "bold");
        doc.setTextColor(...ink);
        doc.text(`${bill.items.length} Units`, margin + 24, summaryY + wordsHeight + 6);

        doc.setDrawColor(...line);
        doc.setFillColor(255, 255, 255);
        doc.rect(totalsX, summaryY, totalsWidth, 27, "FD");
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text("Total", totalsX + 4, summaryY + 6);
        doc.setTextColor(...ink);
        doc.text(currency.format(total), totalsX + totalsWidth - 4, summaryY + 6, { align: "right" });
        doc.setDrawColor(...line);
        doc.line(totalsX, summaryY + 9, totalsX + totalsWidth, summaryY + 9);
        doc.setTextColor(...muted);
        doc.text("Paid", totalsX + 4, summaryY + 15);
        doc.setTextColor(...ink);
        doc.text(currency.format(paid), totalsX + totalsWidth - 4, summaryY + 15, { align: "right" });
        doc.line(totalsX, summaryY + 18, totalsX + totalsWidth, summaryY + 18);
        doc.setFillColor(...brandDark);
        doc.rect(totalsX, summaryY + 18, totalsWidth, 9, "F");
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("Balance Due", totalsX + 4, summaryY + 24);
        doc.setFont("NotoSans", "normal");
        doc.text(currency.format(due), totalsX + totalsWidth - 4, summaryY + 24, { align: "right" });

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...ink);
        doc.text(`For ${shopInfo.name}`, totalsX + totalsWidth, summaryY + 35, { align: "right" });
        doc.setDrawColor(...muted);
        doc.setLineWidth(0.25);
        doc.line(totalsX + totalsWidth - 50, summaryY + 45, totalsX + totalsWidth, summaryY + 45);
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...ink);
        doc.text("Authorised Signature", totalsX + totalsWidth, summaryY + 50, { align: "right" });

        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);
            doc.setDrawColor(...line);
            doc.setLineWidth(0.25);
            doc.line(margin, pageHeight - 17, pageWidth - margin, pageHeight - 17);
            doc.setFont("NotoSans", "normal");
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            doc.text(`${shopInfo.name} · ${shopInfo.business}`, margin, pageHeight - 10);
            doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: "right" });
        }
        return doc;
    }

    function fileName(bill) {
        const safeBillNo = String(bill.billNo || "bill").replace(/[^\w.-]+/g, "-");
        return `pb-ledger-${safeBillNo}.pdf`;
    }

    async function download(bill) {
        const doc = await createDocument(bill);
        doc.save(fileName(bill));
    }

    async function share(bill) {
        const canShareFile = typeof File === "function"
            && typeof navigator.share === "function"
            && typeof navigator.canShare === "function"
            && navigator.canShare({ files: [new File([], "bill.pdf", { type: "application/pdf" })] });

        const doc = await createDocument(bill);
        const name = fileName(bill);
        if (canShareFile) {
            const file = new File([doc.output("blob")], name, { type: "application/pdf" });
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: `Bill ${bill.billNo}`,
                    });
                    return "shared";
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
                    throw error;
                }
            }
        }
        doc.save(name);
        return "downloaded";
    }

    window.BillPdf = Object.freeze({ amountInWords, download, share, shopInfo });
})();

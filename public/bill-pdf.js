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
                image.src = "/pb-logo.gif";
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

    function drawField(doc, label, value, x, y, maxWidth) {
        const prefix = `${label}: `;
        doc.setFont("helvetica", "bold");
        doc.text(prefix, x, y);
        const valueX = x + doc.getTextWidth(prefix);
        doc.setFont("NotoSans", "normal");
        const lines = doc.splitTextToSize(String(value || "—"), Math.max(10, maxWidth - (valueX - x)));
        doc.text(lines, valueX, y);
        return lines.length;
    }

    async function download(bill) {
        if (!bill || !Array.isArray(bill.items) || bill.items.length === 0) {
            throw new Error("This bill has no items to export.");
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ format: "a4", unit: "mm" });
        const [font, logo] = await Promise.all([getPdfFont(), getLogo()]);
        doc.addFileToVFS("NotoSans.ttf", font);
        doc.addFont("NotoSans.ttf", "NotoSans", "normal");
        doc.setFont("NotoSans", "normal");

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        doc.setProperties({
            title: `${shopInfo.name} - Bill ${bill.billNo}`,
            subject: `Bill ${bill.billNo}`,
        });
        doc.addImage(logo, "PNG", pageWidth / 2 - 18, 8, 36, 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(24, 33, 58);
        doc.text(shopInfo.name, pageWidth / 2, 34, { align: "center" });
        doc.setFontSize(10);
        doc.text(shopInfo.business, pageWidth / 2, 40, { align: "center" });
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(9);
        doc.text(shopInfo.address, pageWidth / 2, 45, { align: "center" });
        doc.text(`Mobile: ${shopInfo.mobile}`, pageWidth / 2, 50, { align: "center" });
        doc.setDrawColor(60, 65, 75);
        doc.setLineWidth(0.35);
        doc.line(margin, 56, pageWidth - margin, 56);

        const halfWidth = pageWidth / 2 - margin - 5;
        const rightX = pageWidth / 2 + 5;
        const rightWidth = pageWidth - margin - rightX;
        drawField(doc, "Bill No", bill.billNo, margin, 65, halfWidth);
        drawField(doc, "Date", dateLabel(bill.billDate), margin, 72, halfWidth);
        drawField(doc, "Customer", bill.customerName, rightX, 65, rightWidth);
        drawField(doc, "Mobile", bill.customerMobile, rightX, 72, rightWidth);
        const addressLines = drawField(doc, "Address", bill.customerAddress, rightX, 79, rightWidth);
        const dueY = 79 + Math.max(1, addressLines) * 6;
        drawField(doc, "Payment Due Date", dateLabel(bill.dueDate), rightX, dueY, rightWidth);

        doc.autoTable({
            startY: Math.max(92, dueY + 8),
            margin: { left: margin, right: margin, top: 16, bottom: 58 },
            head: [["#", "Code", "Product / Details", "IMEI No.", "Amount"]],
            body: bill.items.map((item, index) => [
                String(index + 1),
                item.productCode || "—",
                item.productName || "—",
                item.imei || "—",
                currency.format(Number(item.amount) || 0),
            ]),
            theme: "plain",
            styles: {
                font: "NotoSans",
                fontStyle: "normal",
                fontSize: 8,
                cellPadding: 2.4,
                overflow: "linebreak",
                lineColor: [224, 227, 233],
                lineWidth: { bottom: 0.15 },
                textColor: [24, 33, 58],
            },
            headStyles: {
                fillColor: [245, 246, 251],
                textColor: [24, 33, 58],
                font: "helvetica",
                fontStyle: "bold",
                lineWidth: { bottom: 0.2 },
            },
            columnStyles: {
                0: { cellWidth: 9, halign: "center" },
                1: { cellWidth: 29 },
                3: { cellWidth: 43 },
                4: { cellWidth: 31, halign: "right" },
            },
        });

        const amountWords = amountInWords(bill.total);
        const amountWordsLines = doc.splitTextToSize(amountWords, pageWidth - margin * 2 - 39);
        const amountWordsHeight = Math.max(12, amountWordsLines.length * 4 + 5);
        let totalsY = doc.lastAutoTable.finalY + 8;
        const summaryHeight = 17 + 5 + amountWordsHeight + 20;
        if (totalsY + summaryHeight > pageHeight - margin) {
            doc.addPage();
            totalsY = margin + 10;
        }

        const amountX = pageWidth - margin;
        doc.setTextColor(24, 33, 58);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(9);
        doc.text("Total", amountX - 40, totalsY, { align: "right" });
        doc.text(currency.format(Number(bill.total) || 0), amountX, totalsY, { align: "right" });
        doc.text("Paid", amountX - 40, totalsY + 7, { align: "right" });
        doc.text(currency.format(Number(bill.paid) || 0), amountX, totalsY + 7, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Due", amountX - 40, totalsY + 16, { align: "right" });
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(14);
        doc.text(currency.format(Number(bill.due) || 0), amountX, totalsY + 16, { align: "right" });

        const wordsY = totalsY + 23;
        doc.setDrawColor(214, 218, 225);
        doc.setLineWidth(0.25);
        doc.roundedRect(margin, wordsY, pageWidth - margin * 2, amountWordsHeight, 2, 2, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("Amount in Words:", margin + 3, wordsY + 7);
        const labelWidth = doc.getTextWidth("Amount in Words: ");
        doc.setFont("NotoSans", "normal");
        doc.text(amountWordsLines, margin + 3 + labelWidth, wordsY + 7);

        const signatureY = wordsY + amountWordsHeight + 12;
        doc.line(pageWidth - margin - 50, signatureY, pageWidth - margin, signatureY);
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(8);
        doc.text("Authorised Signature", pageWidth - margin - 25, signatureY + 5, { align: "center" });

        for (let page = 1; page <= doc.getNumberOfPages(); page++) {
            doc.setPage(page);
            doc.setFont("NotoSans", "normal");
            doc.setFontSize(7);
            doc.setTextColor(120, 129, 152);
            doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 7, { align: "right" });
        }
        const safeBillNo = String(bill.billNo || "bill").replace(/[^\w.-]+/g, "-");
        doc.save(`billwise-${safeBillNo}.pdf`);
    }

    window.BillPdf = Object.freeze({ amountInWords, download, shopInfo });
})();

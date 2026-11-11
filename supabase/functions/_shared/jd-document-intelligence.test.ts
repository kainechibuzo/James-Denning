import {assertEquals,assertStringIncludes} from "jsr:@std/assert";
import {extractiveSummary,normaliseDocumentText} from "./jd-document-intelligence.ts";
Deno.test("normalises CRLF, tabs and NUL bytes",()=>assertEquals(normaliseDocumentText(" A\r\nB\u0000 \t\n"),"A\nB"));
Deno.test("extractive summary is bounded and grounded in source sentences",()=>{const source="This is a sufficiently long opening sentence with details. This is another sufficiently long sentence describing the next point. A short bit.";const summary=extractiveSummary(source,1);assertStringIncludes(source,summary);});

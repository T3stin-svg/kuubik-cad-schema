# Kuubik CAD Schema

MIT-litsentsiga, tarnijaneutraalne failiskeem eraldiseisvale 2D CAD-rakendusele.
See repo kirjeldab `.kdraw` dokumendi, atomaarse operatsioonilogi ja
AutoCAD 2024.1.2 2D parity-tõendi avalikke liideseid. See ei sisalda AutoCADi,
LibreCADi ega FreeCADi lähtekoodi.

Põhireeglid:

- koordinaadid on lõpliku väärtusega JavaScripti `number`-id (IEEE-754 double);
- igal objektil on dokumendis stabiilne ja unikaalne handle;
- tundmatu objekt säilitatakse `proxy`-objektina, mitte ei kustutata;
- üks `CadOperation` kirjeldab üht atomaarset undo-sammu;
- oracle-raport ei ole sertifitseeriv autoriteet.

`CadSpline` preserves both representations needed by AutoCAD-compatible 2D
workflows. `definitionMethod` is optional so existing schema-version 1 files
remain valid and defaults to `control-vertices`. A `fit-points` spline retains
its original fit points, tolerance, optional endpoint tangents and knot
parameterization in addition to the evaluated control-point/knot form used by
renderers and geometry kernels. This metadata is document data; it does not
make AutoCAD, LibreCAD or FreeCAD a runtime dependency.

```bash
npm install
npm run check
```

JSON Schema asub failis `schema/kdraw-v1.schema.json` ja TypeScripti tüübid
paketi avalikus ekspordis.
Neutral MIT-licensed Kuubik Draw 2D document schema

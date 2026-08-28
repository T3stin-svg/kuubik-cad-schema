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

```bash
npm install
npm run check
```

JSON Schema asub failis `schema/kdraw-v1.schema.json` ja TypeScripti tüübid
paketi avalikus ekspordis.
Neutral MIT-licensed Kuubik Draw 2D document schema

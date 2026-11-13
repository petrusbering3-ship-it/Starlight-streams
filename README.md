# Starlight Streams

Stream spil fra din gaming PC til en hvilken som helst browser, derhjemme eller ude. Du kan også tænde og slukke PC'en med en knap.

Starlight Streams er bygget på [Moonlight Web](https://github.com/MrCreativ3001/moonlight-web-stream) af MrCreativ3001 (GPL-3.0). Den har alle funktionerne fra Moonlight Web, og derudover:

- **Smarte skærm-bokse:** PC-kortet viser præcis så mange bokse, som PC'en har skærme, med navn, opløsning og Hz. Under streamen skifter **Ctrl+Shift+D** mellem dine to sidste skærme.
- **Stream-knappen tænder PC'en:** Er PC'en slukket, bliver den tændt. Når den er klar, starter det spil du spillede sidst.
- **Sluk og Dvale:** Sluk PC'en eller sæt den i dvale fra browseren. Fra dvale vågner den på få sekunder.
- **Game Mouse:** Til spil som Minecraft. Laptoppens musemarkør forsvinder, og musen styrer kun PC'en. Tænd og sluk med **Ctrl+Shift+M**.
- **Auto-kvalitet:** Før hver stream testes forbindelsen, og opløsning, fps og bitrate vælges automatisk. Bliver nettet dårligere under spillet, sænkes kvaliteten af sig selv (og hæves igen bagefter), uden at fuld skærm eller musen slippes. Du kan stadig vælge selv under **Quick Setup**: svagt net, balanceret eller bedste kvalitet.
- **Find PC'er automatisk:** "Tilføj PC" viser gaming PC'erne på dit netværk. Klik på én, og så er den tilføjet.
- **Opdater med ét klik:** Når der er en ny version, viser Starlight en grøn **⬆ Update**-knap.
- **Auto-sluk:** PC'en slukker selv, når ingen har streamet i 30 minutter. Bruger nogen musen eller tastaturet på PC'en efter streamen, slukker den ikke, før du har streamet igen og ingen har rørt den i 30 minutter. Den viser først en advarsel på 2 minutter på PC'en.
- **Gæste-link:** Lad en ven spille i nogle timer via et link. Linket udløber af sig selv, og gæster kan ikke slukke din PC.
- **Skarpere billede:** Når billedet forstørres, gøres det skarpere i browseren (som AMD FSR). Indstillinger, **Picture Sharpening**.
- **Hurtigere lyd:** Lyden holdes tæt på billedet, også efter et hak i nettet.
- **Lydløs derhjemme:** PC'ens højttalere er tavse, mens du streamer. Lyden kommer i fuld styrke på laptoppen.

---

## Guide: fra nul til spil

### Det skal du bruge

| Maskine | Hvad den gør |
|---|---|
| **Gaming PC** (Windows) | Den du spiller *fra*. Den kører Sunshine og Starlights sluk-program. |
| **Server-laptop** (Windows, fx en gammel laptop) | Kører Starlight Streams og sender tænd-signalet. Skal altid være tændt og stå på samme hjemmenetværk som gaming PC'en. |
| **Den du spiller på** | Hvilken som helst computer med en browser (Chrome eller Edge anbefales). Der skal ikke installeres noget. |

Brug netværkskabel til gaming PC'en og helst også til server-laptoppen. Det giver mindst forsinkelse, og tænd-signalet (Wake-on-LAN) virker normalt kun over kabel.

### Trin 1: Hent installationsprogrammerne

Gå til [den nyeste udgivelse](../../releases/latest) og hent:
- `Starlight-Streams-Laptop.zip`
- `Starlight-Streams-PC.zip`

### Trin 2: Installer på server-laptoppen

1. Pak `Starlight-Streams-Laptop.zip` ud, fx på skrivebordet.
2. Dobbeltklik på **`Install.bat`** og tryk **Ja**, når Windows spørger om administrator-adgang.
   Hvis Windows viser "Windows beskyttede din PC", så tryk **Flere oplysninger** og derefter **Kør alligevel**.
3. Svar på spørgsmålene:
   - **Sluk-password:** Find på et password med kun bogstaver og tal, og skriv det ned. Det skal også bruges på gaming PC'en.
   - **Auto-sluk:** Tryk Enter for 30 minutter, eller skriv `0` for aldrig.
4. Installationsprogrammet installerer **Tailscale** (gratis). Log ind med fx din Google-konto, når browseren åbner.
5. Første gang beder Tailscale dig slå **Funnel** til. Åbn linket og tryk **Enable**.
6. Til sidst vises en adresse, der slutter på **`.ts.net`**. Det er din Starlight-adresse, og den virker fra alle browsere i hele verden.

Installationsprogrammet sørger også for, at Starlight starter af sig selv, når laptoppen tænder. Laptoppen går heller ikke i dvale, når den er sat til strøm, heller ikke med låget lukket.

### Trin 3: Installer på gaming PC'en

1. Pak `Starlight-Streams-PC.zip` ud og dobbeltklik på **`Install.bat`**. Tryk **Ja**.
2. Skriv **det samme sluk-password** som på laptoppen.
3. Installationsprogrammet installerer **Sunshine** (programmet der streamer skærmen) og sluk-programmet. Det slår også Wake-on-LAN til i Windows.
4. Skriv den **IP-adresse** ned, der vises til sidst (fx `192.168.1.20`).
5. Åbn **https://localhost:47990** på gaming PC'en og opret et brugernavn og password til Sunshine. Browseren advarer om certifikatet; tryk **Avanceret** og fortsæt.
6. **Genstart gaming PC'en** én gang.

### Trin 4: BIOS-indstillinger (så PC'en kan tændes igen)

Gå ind i BIOS på gaming PC'en (tryk typisk `Del` eller `F2`, mens PC'en starter):
- Slå **Wake on LAN** til. Det kan også hedde "Power On By PCI-E" eller "Resume by LAN".
- Slå **ErP** og **Deep Sleep** fra.

### Trin 5: Første login og parring

1. Åbn din `.ts.net`-adresse (eller `http://localhost:8080` på laptoppen).
2. **Første login opretter din admin-konto.** Det navn og password, du skriver, bliver dit login.
3. Tryk på **tilføj PC** (skærmen med +). Gaming PC'en dukker op på listen efter et par sekunder: klik på den. Hvis den ikke dukker op, så skriv IP-adressen fra trin 3.
4. Tryk på PC'en. Der vises en **PIN-kode**.
5. Gå til **https://localhost:47990** på gaming PC'en, vælg **PIN**, skriv koden og tryk **Send**.

Færdig! Tryk på den grønne **▶ Stream** under **Display 1** eller **Display 2**.

---

## Ingen laptop? Alt-i-én

Har du kun en gaming PC, kan alt køre på den. Så streamer du til fx en Chromebook i browseren.

1. Hent **`Starlight-Streams-AllInOne.zip`** fra [Releases](https://github.com/petrusbering3-ship-it/Starlight-streams/releases/latest), pak den ud og dobbeltklik på **`Install.bat`**. Tryk **Ja**.
2. Vælg et sluk-password, og tryk Enter ved auto-sluk (så slukker PC'en aldrig af sig selv).
3. Log ind i **Tailscale**, når browseren åbner, og tryk **Enable** ved Funnel.
4. Følg de 5 trin, der vises til sidst: opret Sunshine-login, åbn `http://localhost:8080`, tilføj PC'en og par den.
5. På Chromebooken: åbn adressen, der slutter på **`.ts.net`**.

**Husk:** PC'en skal være tændt, når du vil streame. Den kan ikke tændes på afstand, fordi Starlight selv kører på PC'en. Sluk virker fint.

---

## Raspberry Pi i stedet for laptoppen

En Raspberry Pi kan være serveren. Den er lille og lydløs og bruger næsten ingen strøm, så den kan altid stå tændt. Den tænder PC'en, ligesom laptoppen gjorde.

### Det skal du bruge

- En **Raspberry Pi 4 eller 5** (en Pi 3 virker også, men langsommere) med strømforsyning og et SD-kort på mindst 16 GB.
- **Kabel-tricket** (anbefalet): et netværkskabel direkte fra Pi'en til gaming PC'en. Pi'en er på Wi-Fi, og PC'en får internet gennem Pi'en.

### Trin 1: Gør SD-kortet klar

1. Hent **Raspberry Pi Imager** (raspberrypi.com/software) på en computer.
2. Vælg din Pi, vælg **Raspberry Pi OS Lite (64-bit)** og dit SD-kort.
3. Tryk **Rediger indstillinger**. Vælg et brugernavn og password, skriv **dit Wi-Fi-navn og -password**, og slå **SSH** til under Tjenester.
4. Skriv kortet, sæt det i Pi'en og tænd den. Vent 2 minutter.

### Trin 2: Kabel-tricket

1. Tag netværkskablet fra gaming PC'en ud af routeren, og sæt det i **Pi'en** i stedet.
2. Det er det hele. Pi'en giver PC'en en adresse (`192.168.50.x`) og internet gennem sin Wi-Fi.
   - Har PC'en også Wi-Fi, kan den bruge det til internet. Så går kun Starlight gennem kablet.
3. Fordele: tænd-signalet (Wake-on-LAN) går direkte gennem kablet og virker altid, og billedet fra PC'en til Pi'en får aldrig forsinkelse fra Wi-Fi.

### Trin 3: Installer på Pi'en

1. Åbn **PowerShell** på en computer på samme Wi-Fi, og skriv `ssh dit-brugernavn@raspberrypi.local`. Skriv `yes`, og så dit password.
2. Kopier disse 3 linjer ind og tryk Enter:
   ```
   curl -L -o pi.tar.gz https://github.com/petrusbering3-ship-it/Starlight-streams/releases/latest/download/Starlight-Streams-Pi.tar.gz
   tar -xzf pi.tar.gz
   bash Starlight-Streams-Pi/install-pi.sh
   ```
3. Svar på spørgsmålene: sluk-password, auto-sluk, og **J** til kabel-tricket, hvis du bruger det.
4. Log ind i **Tailscale** med linket, der vises, og tryk **Enable** ved Funnel.
5. Til sidst vises din Starlight-adresse (den der slutter på **`.ts.net`**).

### Trin 4: Gaming PC'en

1. Kør **`Install.bat`** fra `Starlight-Streams-PC.zip` på PC'en (som i trin 3 længere oppe) med **samme sluk-password**.
2. Slå Wake on LAN til i BIOS (trin 4 længere oppe).
3. Åbn din `.ts.net`-adresse, log ind, tryk **tilføj PC** og klik på PC'en på listen. Par den med PIN-koden.

Har du brugt laptoppen før, så afinstaller Starlight på den (`Uninstall.bat`), så du kun har én server. Brugere og PC'er skal sættes op igen på Pi'en.

**Fejlfinding:** Hvis PC'en ikke tænder med kabel-tricket, så tjek at lyset ved netværksstikket på PC'en lyser, mens den er slukket. Gør det ikke, så slå "ErP" fra i BIOS.

---

## Automatiske opdateringer

Starlight opdaterer sig selv hver nat kl. 4:30, men kun når der er en ny version. Det gælder laptoppen, Pi'en og alt-i-én. Gaming PC'ens sluk-program opdaterer sig selv kl. 4:40, eller næste gang PC'en tænder, hvis den var slukket om natten. Du kan stadig opdatere med det samme med **⬆ Update**.

---

## Sådan bruger du det

| Det vil du | Sådan gør du |
|---|---|
| Spille | Tryk **▶ Stream** under den skærm, du vil se. Er PC'en slukket, bliver den tændt først. |
| Skifte skærm under spillet | **Ctrl+Shift+D**, eller åbn menuen i venstre side og tryk **1**, **2** … under "Display". |
| Spille med musen (Minecraft, skydespil) | **Ctrl+Shift+M** eller **🎮 Game Mouse** i menuen. Musen fanges og styrer kun PC'en, og Esc går til spillet. Hold Esc for at komme ud. Klik i billedet for at fange musen igen. |
| Bedre billede eller mindre hak | Som standard vælger **🤖 Auto** kvaliteten selv før hver stream. Vil du bestemme selv, så vælg en anden knap under Indstillinger, **Quick Setup**. |
| Opdatere | Dobbeltklik på **Opdater Starlight Streams** på laptoppens skrivebord, eller tryk på den grønne **⬆ Update**-knap i Starlight. Har du en gammel version uden genvejen: hent **`Update-Starlight.bat`** fra [den nyeste udgivelse](../../releases/latest) og dobbeltklik på den. |
| Slukke PC'en | **⏻ Power Off** nederst på PC-kortet. |
| Sætte PC'en i dvale | **☾ Sleep** nederst på PC-kortet. Tryk **▶ Stream** for at vække den igen, det tager få sekunder. |
| Lade en ven spille | **🔗 Guest Link** øverst, vælg antal timer og send linket. |
| Stoppe streamen | Menuen i venstre side, tryk **Exit**. |
| Stoppe en auto-sluk | Skriv `shutdown /a` i Kør (`Win + R`) på gaming PC'en inden for 2 minutter. |
| Have lyd fra PC'en derhjemme også | Indstillinger, slå **Play Audio Local** til. |

---

## Mindst mulig forsinkelse

- **Derhjemme:** Brug `http://<server-laptoppens-ip>:8080` i stedet for `.ts.net`-adressen. Så kører billedet direkte på dit eget netværk (WebRTC). Det er det hurtigste.
- **Ude:** `.ts.net`-adressen virker overalt uden installation, men kører billedet over Web Sockets. Det giver lidt mere forsinkelse.
  Vil du have det hurtigste ude, så installer Tailscale på den computer, du spiller på. Brug laptoppens Tailscale-adresse, fx `http://server-laptop:8080`.
- Brug **netværkskabel** til gaming PC'en og server-laptoppen.
- Under **Indstillinger, Quick Setup** vælger du kvaliteten med ét klik. Selv kan du sætte fps og bitrate op. **H265** eller **AV1** giver bedre billede, hvis din computer kan afspille det.
- Under streamen viser **Stats** i menuen, hvor forsinkelsen kommer fra.
- Installationsprogrammerne indstiller selv resten: Sunshine bruger de hurtigste encoder-indstillinger, og Windows får Game Mode og GPU-planlægning. Netværkskortene sender pakker med det samme, og server-laptoppen kører Starlight med høj prioritet. Genstart gaming PC'en efter installationen.
- Brug **Chrome** eller **Edge** og spil i fuld skærm.

## Lås PC'en op automatisk

Viser gaming PC'en låseskærmen, når du starter en stream, spørger Starlight én gang efter din **Windows-PIN** og skriver den selv på låseskærmen. Når du stopper streamen, låser PC'en sig igen, så den er helt normal, når du sidder ved den. PIN-koden gemmes kun i den browser, du streamer fra. Du kan skrive en ny PIN med **🔑 Unlock PC** i menuen under streamen.

---

## Fejlfinding

| Problem | Løsning |
|---|---|
| **Stream** siger, at tænd-signalet ikke kunne sendes | PC'en skal være **parret én gang**, mens den er tændt (trin 5). |
| PC'en tænder ikke | 1) Kør den nyeste `Install.bat` igen på gaming PC'en. Den slår "tænd fra slukket" til på netværkskortet og viser kablets IP-adresse. 2) Er PC'en tilføjet med en anden adresse (fx Wi-Fi'ens), så fjern den i Starlight (højreklik, **Remove Host**), tilføj den med kablets adresse og par igen. 3) Tjek BIOS (trin 4). 4) Gaming PC'en skal bruge **kabel**, og server-laptoppen skal være på samme hjemmenetværk. |
| **Power Off** virker ikke | Sluk-passwordet skal være det samme på begge maskiner. Kør `Install.bat` igen på begge med samme password. |
| Siden kan ikke åbnes | Server-laptoppen skal være tændt. Prøv `http://localhost:8080` på selve laptoppen. |
| `.ts.net`-adressen virker ikke | Kør `Install.bat` igen på laptoppen, og tjek at Funnel er slået til. |
| Forkert skærm | Skærm 1 er den første skærm, Sunshine finder. Tryk **2** i menuen eller Ctrl+Shift+D. |
| Skærm-boksene viser ikke navn og opløsning | Kør den nyeste `Install.bat` på gaming PC'en og log ind på PC'en én gang. Skærmene kan først ses, når nogen er logget ind. |
| Lyd fra PC'en derhjemme | **Play Audio Local** skal være slået fra (det er standard). Virker det stadig ikke, så installer Steam på gaming PC'en. Sunshine bruger Steams virtuelle højttaler til at gøre PC'en lydløs. |

---

## Afinstaller

Hver zip-fil har en **`Uninstall.bat`**. Dobbeltklik på den på den maskine, du vil rydde op på. Sunshine og Tailscale fjernes under **Apps** i Windows-indstillinger.

---

## Avanceret: indstillinger

Server-laptoppens indstillinger ligger i `C:\Program Files\Starlight Streams\server\config.json`. Genstart laptoppen efter ændringer.

```json
{
    "moonlight": {
        "power_agent_token": "MITPASSWORD",
        "power_agent_port": 47900,
        "auto_shutdown_minutes": 30,
        "auto_shutdown_action": "shutdown"
    },
    "web_server": {
        "bind_address": "0.0.0.0:8080"
    }
}
```

| Indstilling | Betydning |
|---|---|
| `power_agent_token` | Sluk-passwordet. Skal være det samme som på gaming PC'en. |
| `power_agent_port` | Porten sluk-programmet lytter på (standard `47900`). |
| `auto_shutdown_minutes` | Minutter uden stream før PC'en slukkes. `0` = aldrig. |
| `auto_shutdown_action` | `"shutdown"` (sluk, med 2 minutters advarsel) eller `"sleep"` (dvale, vågner hurtigere). Standard `"shutdown"`. |
| `bind_address` | Adressen og porten Starlight kører på (standard `0.0.0.0:8080`). |

Alle Moonlight Webs øvrige indstillinger (https, TURN-server, brugere osv.) virker også. De er beskrevet i [Moonlight Webs README](https://github.com/MrCreativ3001/moonlight-web-stream#config).

---

## Til udviklere: byg selv

Kræver Rust, Node.js og `wasm-bindgen-cli` 0.2.128.

```sh
npm ci
npm run build          # bygger web-delen til ./dist
cargo build --release  # bygger web-server og starlight-power-agent
```

Windows-installationsprogrammerne bygges automatisk af GitHub ved hvert push til `main` (`.github/workflows/windows-installer.yml`) og lægges under Releases.

---

## Licens

GPL-3.0-or-later, ligesom Moonlight Web. Tak til [MrCreativ3001](https://github.com/MrCreativ3001/moonlight-web-stream) og alle Moonlight Webs bidragydere, samt til [Moonlight](https://moonlight-stream.org/) og [Sunshine](https://github.com/LizardByte/Sunshine).

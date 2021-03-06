import { log, error } from '../log';
import { interpolate } from '../util/objects';
import { replaceColours, adjustColour, vibrantColour } from '../util/colours';
import { __ } from '../i18n';
import { ready as systemsReady, getSystem } from './System';
import { Instance } from './Instance';
import { Document } from './Document';
import { LoadQueue } from './LoadQueue';
import { events } from './Events';

// import { applyContext } from '../context';
import { locateAsset, toDataURL, inferMimeType } from '../data';
import { isString, isObject, isNull, isArray, isEmpty } from '../util';
import { toKebabCase, toCamelCase, toPathCase, toSpaceCase, toTitleCase } from '../util/strings';
import { has } from '../util/objects';

const knownVars = [
  "inventoryStyle",
  "language",
  "miniSize",
  "skillActions",
];

function parseCharacter(primary, request) {
  // attributes
  let attr = {
    name: false,
    game: 'pathfinder2',
    theme: 'adventurer',
    language: 'en',

    ancestry: false,
    heritage: false,
    background: false,
    class: false,
    archetypes: false,
    description: '',

    printLarge: false,
    printHighContrast: false,
    printDyslexic: false,

    miniSize: 'medium',

    printColour: '#707070',
    accentColour: '',
    printIntensity: 0,
    printWatermark: '',
    printLogo: false,
    printPortrait: false,
    animalPortrait: false,
    printBackground: false,
    ...primary.attributes
  };

  // an object to start with
  let char = {
    name: attr.name,
    game: attr.game,
    units: ['core', 'base', 'base/character', 'theme/' + attr.theme],
    language: attr.language,
    description: attr.description,
    
    ancestry: false,
    heritage: false,
    background: false,
    classes: [],
    archetypes: [],
    feats: [],
    options: {
      'animal-companion': false,
      'party-funds': false,
      'permission': false,
      'build': false,
      'mini': false,
      'spellbook': false
    },
    spellbookStyle: 'normal',
    skillActions: attr.skillActions,
    miniSize: attr.miniSize,

    printLarge: attr.printLarge,
    printHighContrast: attr.printHighContrast,
    printDyslexic: attr.printDyslexic,

    printColour: attr.printColour,
    accentColour: attr.accentColour,
    printIntensity: attr.printIntensity,
    printLogo: attr.printLogo,
    favicon: 'favicon.svg',
    printPortrait: attr.printPortrait,
    animalPortrait: attr.animalPortrait,
    printBackground: attr.printBackground,
    printWatermark: attr.printWatermark,

    debug: primary.debug,
    instances: {},
  };

  // log("Character", "Print intensity", char.printIntensity);
  if (isEmpty(char.accentColour)) {
    char.accentColour = adjustColour('#707070', char.printColour, char.printIntensity);
  }

  // get all the flags
  Object.keys(attr).forEach(key => {
    let flag = toKebabCase(key);

    if (flag.match(/^option-/)) {
      let option = flag.replace(/^option-/, '');
      let ok = char.options[option] = !!attr[key];
      // log("Character", "Option", option, ok);
      if (ok) {
        char.units.push('option/' + option);
      }
    }
  });

  // accessibility options
  if (attr.printLarge) {
    char.units.push('large-print');
  }
  if (attr.printHighContrast) {
    char.units.push('high-contrast');
  }
  if (attr.printDyslexic) {
    char.units.push('dyslexic');
  }

  // game-specific settings
  switch (attr.game) {
    case 'pathfinder2':
      if (attr.ancestry) {
        char.units.push('ancestry/' + attr.ancestry.replace(/^ancestry-/, ''));
        char.ancestry = attr.ancestry.replace(/^ancestry-/, '');

        if (attr.heritage && attr.heritage != "none") {
          char.units.push('heritage/' + char.ancestry + "/" + attr.heritage.replace(/^heritage-/, ''));
        }
      }

      if (attr.ancestryFeats) {
        char.ancestryFeats = parseFeats(attr.ancestryFeats);
      }

      if (attr.background) {
        char.units.push('background/' + attr.background.replace(/^background-/, ''));
      }

      if (attr.class) {
        let className = attr.class.replace(/^class-/, '');
        char.units.push('class/' + className);
        char.classes.push(className);
        let classPrefix = toCamelCase('class ' + className);
        // log("Character", "Class name", className, ", prefix", classPrefix);

        let classFeatsKey = classPrefix + 'Feats';
        if (attr[classFeatsKey]) {
          char.classFeats = parseFeats(attr[classFeatsKey]);
          char.classFeats.forEach(feat => {
            // log("Character", "Class feat:", feat);
            char.units.push('feat/' + className + '/' + feat);
          });
        }

        Object.keys(attr).forEach(key => {
          // log("Character", key);
          // let value = attr[key];

          if (key.startsWith(classPrefix) && !key.endsWith('Feats')) {
            let selname = toKebabCase(key.replace(classPrefix, ''));
            if (isArray(attr[key])) {
              attr[key].forEach(selvalue => {
                selvalue = toKebabCase(selvalue);
                // log("Character", "Class option", key, selname, "=", selvalue);
                const unitname = className + '/' + selname + '/' + selvalue;
                char.units.push(unitname);
              })
            } else if (isString(attr[key])) {
              let selvalue = toKebabCase(attr[key]);
              // log("Character", "Class option", key, selname, "=", selvalue);
              const unitname = className + '/' + selname + '/' + selvalue;
              // log("Character", "Class option unit", unitname);
              char.units.push(unitname);
            }
          }
        });

        // attr.feats.forEach(key => {
        //   let flag = toKebabCase(key);
        //   if (flag.startsWith()
        // });
      }

      // todo select inventory size
      switch (attr.inventoryStyle) {
        case "full":
          char.units.push("option/inventory/full");
          break;

        case "both":
          char.units.push("option/inventory/half");
          char.units.push("option/inventory/full");
          break;

        default:
          char.units.push("option/inventory/half");
      }

      if (attr.archetypes && isArray(attr.archetypes)) {
        attr.archetypes.forEach(archetype => {
          if (isString(archetype)) {
            char.archetypes.push(archetype);
            char.units.push('archetype/' + archetype);
            // log("Character", "Archetype:", "archetype/"+archetype);
          }
        });
      }

      if (attr.feats) {
        char.feats = parseFeats(attr.feats);
        char.feats.forEach(feat => {
          char.units.push("feat/"+feat);
        });
      }

      if (attr.skillFeats) {
        char.skillFeats = parseFeats(attr.skillFeats);
        char.feats.forEach(feat => {
          char.units.push("feat/"+feat);
        });
      }

      if (char.debug) {
        char.units.push('option/debug');
      }

      break;
  }

  // included assets
  ["printPortrait", "animalPortrait", "printLogo", "printBackground"].forEach(field => {
    if (attr[field]) {
      const id = attr[field];
      // log("Character", "Asset:", field, "=", id);
      const instance = request.getInstance(id);
      if (!isNull(instance)) {
        // log("Character", "Asset known:", field, "=", id);
        char.instances[id] = instance.attributes;
      }
    }
  });

  // log("Character", "Parsed", char);
  return char;
}

function parseFeats(feats) {
  return feats;
}

/**
 * Class representing a character sheet for one character.
 */
export class Character extends Instance {
  constructor(primary, request, registry) {
    super();
    this.registry = registry;
    this.request = request;
    this.data = parseCharacter(primary, request);
    this.loadQueue = new LoadQueue();
  }

  getAsset(asset, callback) {
    if (!isNull(asset) && isString(asset) && asset != "" && has(this.data.instances, asset)) {
      // log("Character", "getAsset: known instance", asset);
      asset = this.data.instances[asset];
    }

    if (asset === null) {
      // log("Character", "getAsset: null");
      return;
    } else if (isObject(asset)) {
      // log("Character", "getAsset: object");
      const dataURL = toDataURL(asset.data, asset.mimeType);
      callback(dataURL);
    } else if (isString(asset)) {
      // log("Character", "getAsset: string", asset);
      locateAsset(asset, assetFile => {
        this.loadQueue.loadEmbed(assetFile).then(data => {
          const mimeType = inferMimeType(asset);
          const dataURL = toDataURL(data, mimeType);
          callback(dataURL);
        })
      });
    } else {
      warn("Character", "Unknown asset", asset);
    }
  }

  /**
   * Turn this request into a real character sheet.
   * @returns {Promise} Promise representing the resulting character sheet.
   */
  render() {
    const self = this;
    const data = this.data;
    return new Promise((resolve, reject) => {
      // log("Character", "Render character");
      // log("Character", `Name: ${this.data.name}, game: ${this.data.game}`);
      log("Character", `Units: ${this.data.units}`);

      systemsReady(() => {
        try {
          const system = getSystem(data.game);
          if (system === null) {
            error("Character", "System not found:", data.game);
            return;
          }

          // start with a document
          const documentUnit = system.getUnit("document");
          const document = new Document(documentUnit);

          // language
          document.language = data.language;
          document.setVar('character-name', data.name);
          document.setVar('description', data.description);

          if (data.printLarge) {
            document.largePrint = true;
          }
          if (data.printHighContrast) {
            document.highContrast = true;
          }

          // Load assets
          if (data.favicon) {
            self.getAsset(data.favicon, dataURL => {
              if (data.favicon.match(/\.svg$/) && !isEmpty(data.printColour)) {
                let colour = vibrantColour(data.printColour);
                dataURL = replaceColours(dataURL, colour);
              }
              document.faviconURL = dataURL;
            });
          }

          if (data.printLogo) {
            self.getAsset(data.printLogo, dataURL => {
              document.logoURL = dataURL;
            });
          }

          if (data.printPortrait) {
            self.getAsset(data.printPortrait, dataURL => {
              document.portraitURL = dataURL;
            });
          }

          if (data.animalPortrait) {
            self.getAsset(self.data.animalPortrait, dataURL => {
              document.animalURL = dataURL;
            });
          }

          if (data.printBackground) {
            const printBackground = data.printBackground;
            // log("Character", "Background:", printBackground);
            const bgColours = {
              magnolia: '#F4E9D8',
            };
            if (has(bgColours, printBackground)) {
              document.backgroundColour = bgColours[printBackground];
            } else if (printBackground.match(/(#[A-Za-z0-9]{6}|rgb\([0-9]+,[0-9]+,[0-9]+\))/)) {
              document.backgroundColour = printBackground;
            } else {
              self.getAsset(printBackground, dataURL => {
                document.backgroundURL = dataURL;
              });
            }
          }

          // TODO set character parameters
          document.printColour = data.printColour;
          document.printIntensity = data.printIntensity;
          document.accentColour = data.accentColour;
          document.watermark = data.printWatermark;

          // get known vars from the data
          // log("Character", "data", data);
          knownVars.forEach(varname => {
            if (has(data, varname)) {
              const key = toKebabCase(varname);
              const value = data[varname];
              // log("Character", `Var: ${key} = ${JSON.stringify(value)}`);
              document.setVar(key, value, "high");
            }
          });
          // log("Character", "Document vars", document.vars);

          // load units
          let units = system.getUnits(data.units);
          units = system.inferUnits(units);
          // log("Character", "Inferred units:", units.map(unit => unit.id).sort());

          // infer the title from the units
          let title = __("Character");
          switch (system.code) {
            case 'pathfinder2':
              title = pathfinder2Title(units, document, data);
              break;
          }
          document.title = title;

          // make the element tree
          units.forEach(unit => document.addUnit(unit));
          document.composeDocument(self.registry);

          self.loadQueue.ready(() => {
            events.emit('createElementTree', {
              elementTree: document.doc,
              title: document.title,
              request: self.request
            });

            // render the document
            const data = document.renderDocument(self.registry);

            events.emit('render', {
              data: data,
              title: document.title,
              mimeType: "text/html",
              request: self.request
            });

            resolve({
              data: data,
              filename: title + ".html",
              mimeType: "text/html"
            });
          });
        } catch (err) {
          error("Character", "Error:", err);
          reject({
            error: err
          });
        }
      });
    });
  }
}

function pathfinder2Title(units, doc, data) {
  let parts = {
    name: data.name,
    ancestry: '',
    class: '',
    archetypes: '',
  };

  function getUnits(group) {
    return units.filter(unit => unit.in == group);
  }

  let ancestry = getUnits("ancestry");
  if (!isEmpty(ancestry)) {
    ancestry = ancestry[0];
    parts["ancestry"] = __(ancestry.name, doc);
    let heritage = getUnits("heritage/");
    if (!isEmpty(heritage)) {
      heritage = heritage[0];
      parts["ancestry"] = __(heritage.name, doc);
    }
  }

  let cls = getUnits("class");
  if (!isEmpty(cls)) {
    cls = cls[0];
    parts["class"] = __(cls.name, doc);
  }

  let archetypes = getUnits("archetype");
  if (!isEmpty(archetypes)) {
    parts["archetypes"] = archetypes.map(arch => __(arch.name, doc)).join(" ");
    log("Character", "Archetypes:", parts["archetypes"]);
  }

  let template = isEmpty(parts.name) ? "_{#{ancestry} #{class} #{archetypes}}" : "_{#{name}, #{ancestry} #{class} #{archetypes}}";
  let title = interpolate(__(template, doc), parts);
  title = title.replace(/  +/g, ' ');
  title = title.replace(/^ +/, '');
  title = title.replace(/ +$/, '');
  if (title == "")
    title = "Character";
  return title;
}

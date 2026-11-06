"""Rebuild the nursery note events from the checked-in public-domain MusicXML.
No network or third-party Python modules are needed. Source metadata lives in nursery.json.
"""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

DIRECTORY = Path(__file__).resolve().parents[1] / 'piano' / 'scores'

def extract(item):
    filename = item['id']
    xml = (DIRECTORY.parent / item['source']['file']).read_bytes()
    assert hashlib.sha256(xml).hexdigest() == item['source']['sha256'], (filename, 'source checksum changed; review the edition before rebuilding')
    root = ET.fromstring(xml)
    assert len(root.findall('part')) == 1, filename
    assert not root.findall('.//grace'), (filename, 'grace notes need explicit handling')
    assert not root.findall('.//repeat'), (filename, 'repeat signs need explicit expansion')
    assert not root.findall('.//ending'), (filename, 'alternate endings need explicit expansion')
    assert not root.findall('.//transpose'), (filename, 'transposing instrument')
    division = None
    measure_start = 0.0
    tracks = {'right': [], 'left': []}
    rests = {'right': [], 'left': []}
    open_ties = {}
    measures = []
    source_notes = 0
    merged_ties = 0
    first_signature = None
    first_key = None
    meters = []
    for measure in root.findall('part/measure'):
        cursor = 0.0
        max_end = 0.0
        last_onset = 0.0
        for node in measure:
            if node.tag == 'attributes':
                division = float(node.findtext('divisions', division))
                time = node.find('time')
                if time is not None:
                    signature = [int(time.findtext('beats')), int(time.findtext('beat-type'))]
                    meters.append({'beat': measure_start, 'timeSignature': signature})
                    if first_signature is None:
                        first_signature = signature
                key = node.find('key')
                if key is not None and first_key is None:
                    first_key = {'fifths': int(key.findtext('fifths')), 'mode': key.findtext('mode', 'major')}
            elif node.tag in ('backup', 'forward'):
                amount = float(node.findtext('duration')) / division
                cursor += amount * (-1 if node.tag == 'backup' else 1)
                assert cursor >= -1e-8, (filename, measure.attrib, 'negative cursor')
                max_end = max(max_end, cursor)
            elif node.tag == 'note':
                duration = float(node.findtext('duration')) / division
                assert duration > 0
                is_chord = node.find('chord') is not None
                onset = last_onset if is_chord else cursor
                if not is_chord:
                    last_onset = onset
                    cursor += duration
                max_end = max(max_end, onset + duration)
                staff = int(node.findtext('staff', '1'))
                assert staff in (1, 2), (filename, staff)
                hand = 'right' if staff == 1 else 'left'
                voice = node.findtext('voice', '1')
                absolute = measure_start + onset
                if node.find('rest') is not None:
                    rests[hand].append({'beat': absolute, 'dur': duration, 'voice': voice, 'measure': measure.attrib['number']})
                    continue
                source_notes += 1
                pitch = node.find('pitch')
                assert pitch is not None, (filename, 'unpitched note')
                alteration = int(pitch.findtext('alter', '0'))
                assert alteration in (-1, 0, 1), (filename, 'unexpected double accidental')
                name = pitch.findtext('step') + ('#' if alteration == 1 else 'b' if alteration == -1 else '') + pitch.findtext('octave')
                tie_types = {tie.attrib['type'] for tie in node.findall('tie')}
                tie_key = (staff, voice, name)
                if 'stop' in tie_types:
                    assert tie_key in open_ties, (filename, measure.attrib, 'missing tie start', tie_key)
                    event = open_ties[tie_key]
                    assert abs(event['beat'] + event['dur'] - absolute) < 1e-8, (filename, 'non-contiguous tie', event, absolute)
                    event['dur'] += duration
                    merged_ties += 1
                    if 'start' not in tie_types:
                        del open_ties[tie_key]
                else:
                    event = {'note': name, 'dur': duration, 'beat': absolute, 'voice': voice, 'sourceMeasure': measure.attrib['number']}
                    tracks[hand].append(event)
                    if 'start' in tie_types:
                        assert tie_key not in open_ties
                        open_ties[tie_key] = event
        assert max_end > 0, (filename, 'empty measure')
        measures.append({'number': measure.attrib['number'], 'beat': measure_start, 'dur': max_end})
        measure_start += max_end
    assert not open_ties, (filename, 'unresolved ties')
    assert first_signature and first_key
    assert all(change['timeSignature'] == first_signature for change in meters), (filename, 'meter change needs renderer support')
    meter = first_signature[0] * 4 / first_signature[1]
    for events in tracks.values():
        events.sort(key=lambda event: (event['beat'], event['voice'], event['note']))
        assert events and all(event['beat'] >= 0 and event['beat'] + event['dur'] <= measure_start + 1e-8 for event in events)
    tempos = [{'beat': 0, 'quarterBpm': float(sound.attrib['tempo'])} for sound in root.findall('.//sound') if 'tempo' in sound.attrib]
    assert tempos and len({tempo['quarterBpm'] for tempo in tempos}) == 1, (filename, 'tempo provenance needed')
    key_names = {-7: 'Cb', -6: 'Gb', -5: 'Db', -4: 'Ab', -3: 'Eb', -2: 'Bb', -1: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#'}
    item['right'] = [[e['note'], e['beat'], e['dur'], e['voice']] for e in tracks['right']]
    item['left'] = [[e['note'], e['beat'], e['dur'], e['voice']] for e in tracks['left']]
    item['duration'] = measure_start
    item['timeSignature'] = first_signature
    item['meter'] = meter
    item['pickup'] = measures[0]['dur'] if measures[0]['dur'] < meter - 1e-8 else 0
    item['tempo'] = tempos[0]['quarterBpm']
    return item

if __name__ == '__main__':
    target = DIRECTORY / 'nursery.json'
    scores = [extract(item) for item in json.loads(target.read_text())]
    target.write_text(json.dumps(scores, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('Imported', len(scores), 'complete nursery scores from local MusicXML.')

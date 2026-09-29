// TEMPORARY test harness (removed after screenshots) — mock Dataverse for the Service Hub sections.
import { setPreviewGateway, type DataverseRow } from './data/dataverse';
import { ALLOW_ALL, setPreviewPrivileges } from './data/permissions';

const F = '@OData.Community.Display.V1.FormattedValue';
const bu = (id: string, name: string, region: string) => ({ businessunitid: id, name, region });
const BUS = [bu('b1', 'ASH', 'EGY'), bu('b2', 'SMH', 'EGY'), bu('b3', 'AMH', 'EGY'), bu('b4', 'Alex', 'EGY'), bu('k1', 'Riyadh', 'KSA'), bu('k2', 'Jeddah', 'KSA')];
const inFuture = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);

const specialty = (id: string, name: string, region: number | null) => ({
  cr301_specialtyksa_service_hubid: id,
  cr301_title: name,
  cr18c_region: region,
  cr301_arabicname: { s1: 'العظام', s2: 'القلب' }[id] ?? '',
  servhub_butxt: id === 's1' ? 'ASH, AMH' : 'SMH',
  cr301_valueproposition: id === 's1' ? '<p>Top <strong>orthopedic</strong> center with robotic knee replacement.</p>' : '',
});
const DETAILS_BY_BU = [
  { cr301_topic: 'Booking', cr301_details: '<ul><li>Book via call center only</li><li>X-ray required</li></ul>', _cr18c_bun_value: 'b1', _cr301_specialty_value: 's1' },
  { cr301_topic: 'Age', cr301_details: 'Adults only', _cr18c_bun_value: 'b1', _cr301_specialty_value: 's1' },
  { cr301_topic: 'KSA note', cr301_details: 'Should not show in Egypt', _cr18c_bun_value: 'k1', _cr301_specialty_value: 's1' },
];
const SPECIALTY_DETAILS = [{ cr301_subspeciality: 'Knee Surgery', cr301_details: '<p>Arthroscopy and ACL reconstruction.</p>', cr18c_region: null }];
const doctor = (id: string, en: string, ar: string, spec: string, sub: [string, string], extra: DataverseRow = {}) => ({
  cr301_newdoctordatasetid: id,
  cr301_title: `Dr. ${en.split(' ')[0]}`,
  servhub_doctornameen: en,
  cr301_doctornamear: ar,
  _cr301_specialty_value: spec,
  '_cr301_specialty_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'cr301_specialtyksa_service_hub',
  _cr301_subspecialty_value: sub[0],
  [`_cr301_subspecialty_value${F}`]: sub[1],
  _cr301_degree_value: 'g1',
  _cr301_nationality_value: 'n1',
  servhub_examinationage: 'From 12 years',
  cr301_scopeofservice: '<ul><li>Knee arthroscopy</li><li>Sports injuries</li></ul>',
  cr301_scopeofservicear: '<p>مناظير الركبة وإصابات الملاعب</p>',
  cr301_qualificationsandexperience: 'MD Orthopedics, Cairo University\nFellowship, UK',
  cr301_drnotes: '<p><strong>Note:</strong> Book 2 days ahead.</p>',
  ...extra,
});
const fee = (doctorId: string, buId: string, original: number, firstPriority = false) => ({
  _cr301_doctorname_value: doctorId,
  _cr301_businessunit_value: buId,
  cr301_originalconsultationfees: String(original),
  cr301_affiliateconsultationfees: String(original - 50),
  cr301_contractconsultationfees: '',
  cr301_walkinconsultationfees: String(original + 100),
  cr301_firstpriority: firstPriority,
});

const TABLES: Record<string, DataverseRow[]> = {
  cr301_newdoctordatasets: [
    doctor('d1', 'Ahmed Yehia', 'أحمد يحيى', 's1', ['ss1', 'Knee Surgery'], { cr18c_exclusiveness: 1, servhub_procedureclinics: 'Endoscopy Clinic' }),
    doctor('d2', 'Mona Hassan', 'منى حسن', 's2', ['ss2', 'Pediatric Cardiology']),
    doctor('d3', 'Karim Adel', 'كريم عادل', 's1', ['ss3', 'Spine Surgery'], { cr18c_exclusiveness: 0 }),
    doctor('d4', 'Sara Fathy', 'سارة فتحي', 's3', ['ss4', 'Rhinology']),
    doctor('d5', 'Omar Nabil', 'عمر نبيل', 's2', ['ss5', 'Interventional Cardiology']),
    doctor('d6', 'Hidden Doctor', 'بدون رسوم', 's1', ['ss1', 'Knee Surgery']),
    doctor('k-d1', 'Faisal Alharbi', 'فيصل الحربي', 's4', ['ss4', 'Rhinology'], { cr301_stardoctor: 3, cr301_contracttype: 1 }),
    doctor('k-d2', 'Noura Alqahtani', 'نورة القحطاني', 's5', ['ss4', 'Rhinology'], { cr301_stardoctor: 1, cr301_contracttype: 3 }),
  ],
  cr301_table1s: [
    fee('d1', 'b1', 600, true), fee('d1', 'b3', 500), fee('d2', 'b2', 450), fee('d3', 'b1', 700), fee('d3', 'b2', 650, true),
    fee('d4', 'b3', 400), fee('d5', 'b2', 550), fee('k-d1', 'k1', 300), fee('k-d2', 'k2', 250), fee('k-d2', 'k1', 260),
    { ...fee('d6', 'b1', 100), cr18c_manualopdflag: 'NONE' },
  ],
  cr301_specialtyksa_service_hubs: [specialty('s1', 'Orthopedics', 983080000), specialty('s2', 'Cardiology', null), specialty('s3', 'E.N.T', 983080000), specialty('s4', 'E.N.T', 983080001), specialty('s5', 'E.N.T surgery', 983080001)],
  cr301_subspecialtyksa_service_hubs: [
    { cr301_subspecialtyksa_service_hubid: 'ss1', cr301_title: 'Knee Surgery' },
    { cr301_subspecialtyksa_service_hubid: 'ss2', cr301_title: 'Pediatric Cardiology' },
    { cr301_subspecialtyksa_service_hubid: 'ss3', cr301_title: 'Spine Surgery' },
    { cr301_subspecialtyksa_service_hubid: 'ss4', cr301_title: 'Rhinology' },
    { cr301_subspecialtyksa_service_hubid: 'ss5', cr301_title: 'Interventional Cardiology' },
  ],
  cr301_doctordegreeksa_service_hubs: [{ cr301_doctordegreeksa_service_hubid: 'g1', cr301_title: 'Consultant' }, { cr301_doctordegreeksa_service_hubid: 'g2', cr301_title: 'Specialist' }],
  cr301_doctornationalityksa_service_hubs: [{ cr301_doctornationalityksa_service_hubid: 'n1', cr301_title: 'Egyptian' }],
  cr18c_servhubspecialtymappings: [{ _cr18c_dotcarespecialty_value: 's5', _cr18c_finalspecialty_value: 's4' }],
  cr301_doctorexceptionreasons: [
    { _cr301_doctor_name_value: 'd1', cr301_exception_type: 'Vacation', cr301_exception_reason: 'Annual leave', cr301_from: '2026-09-20', cr301_to: inFuture, [`_cr301_businessunit_value${F}`]: 'ASH', servhub_procedureclinics: 'Pain Clinic' },
  ],
  servhub_procedcureclincs: [{ servhub_clinic: 'Endoscopy Clinic', servhub_clinicar: 'عيادة المناظير' }, { servhub_clinic: 'Pain Clinic', servhub_clinicar: '' }],
};

const SERVICES: DataverseRow[] = Array.from({ length: 75 }, (_, i) => ({
  cr301_ksaservicedatasetid: `sv${i}`,
  cr301_title: i % 10 === 0 ? `Package ${i}: Full checkup` : `Service ${i} — ${['CBC', 'MRI Knee', 'X-Ray Chest', 'Echo'][i % 4]}`,
  cr301_servicear: ['صورة دم كاملة', 'رنين مغناطيسي على الركبة', 'أشعة على الصدر', 'إيكو'][i % 4],
  cr301_code: `C-${1000 + i}`,
  servhub_priced: 100 + ((i * 37) % 900),
  _cr301_specialty_value: ['s1', 's2', 's3'][i % 3],
  _cr18c_bu_value: ['b1', 'b2', 'b3'][i % 3],
  _cr301_servicecategory_value: i % 10 === 0 ? 'cat-pkg' : ['cat-lab', 'cat-rad'][i % 2],
}));
TABLES.cr301_servicecategoryksa_service_hubs = [
  { cr301_servicecategoryksa_service_hubid: 'cat-pkg', cr301_title: 'Package' },
  { cr301_servicecategoryksa_service_hubid: 'cat-lab', cr301_title: 'Laboratory' },
  { cr301_servicecategoryksa_service_hubid: 'cat-rad', cr301_title: 'Radiology' },
];

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
Object.assign(TABLES, {
  cr301_coelists: [
    { cr301_coelistid: 'c1', cr301_coeclinicname: 'Knee & Sports Center', cr301_clinicalleader: 'Dr. Ahmed Yehia', cr301_clinicalcoordinator: 'Nurse Salma', cr301_coemembers: 'Dr. Karim, Dr. Omar', cr301_txtsubspecialty: 'Knee Surgery / Sports', _cr18c_bu_value: 'b1', cr301_arabicscript: 'مرحباً بك في مركز الركبة. نرجو الحجز مسبقاً. الأسعار تشمل الكشف', cr301_englishscript: '<ol><li>Call the center</li><li>Confirm the X-ray</li></ol>', cr301_valueproposition: 'Only robotic center in Alex. Same-day surgery' },
    { cr301_coelistid: 'c2', cr301_coeclinicname: 'Heart Center', cr301_clinicalleader: 'Dr. Mona', cr301_txtsubspecialty: 'Pediatric Cardiology', _cr18c_bu_value: 'b2' },
    { cr301_coelistid: 'c3', cr301_coeclinicname: 'KSA Only Center', cr301_txtsubspecialty: 'Rhinology', _cr18c_bu_value: 'k1' },
  ],
  cr301_andalusialocationses: [
    { cr301_andalusialocationsid: 'l1', cr301_branchname: 'Andalusia Smouha Hospital', cr301_area: 'Alexandria', cr301_description: '14 Victor Emmanuel St., Smouha', cr301_location: 'https://maps.google.com/?q=Smouha', cr18c_region: 'EGY', cr301_image: 'https://example.invalid/missing.jpg' },
    { cr301_andalusialocationsid: 'l2', cr301_branchname: 'Andalusia Maadi', cr301_area: 'Cairo', cr301_description: 'Road 9, Maadi', cr301_location: 'https://maps.google.com/?q=Maadi', cr18c_region: 'EGY' },
    { cr301_andalusialocationsid: 'l3', cr301_branchname: 'Andalusia Jeddah', cr301_area: 'Jeddah', cr18c_region: 'KSA' },
  ],
  servhub_procedcureclincs: [
    { servhub_clinic: 'Endoscopy Clinic', servhub_clinicar: 'عيادة المناظير', _cr18c_bun_value: 'b1', cr18c_details: 'الحجز قبلها بيوم. الصيام 8 ساعات' },
    { servhub_clinic: 'Endoscopy Clinic', servhub_clinicar: 'عيادة المناظير', _cr18c_bun_value: 'b3', cr18c_details: '<p>Walk-in allowed</p>' },
    { servhub_clinic: 'Pain Clinic', servhub_clinicar: '', _cr18c_bun_value: 'b2', cr18c_details: '' },
  ],
  cr301_bankaccountses: [
    { cr301_bankname: 'Al Rajhi', cr301_accountowner: 'Andalusia Riyadh', cr301_accountnumber: '123456789', cr301_ibannumber: 'SA0380000000608010167519', cr301_notes: 'Transfer then send receipt', _cr18c_bun_value: 'k1' },
    { cr301_bankname: 'SNB', cr301_accountowner: 'Andalusia Riyadh', cr301_accountnumber: '555', cr301_ibannumber: 'SA99', _cr18c_bun_value: 'k1' },
    { cr301_bankname: 'SNB', cr301_accountowner: 'Andalusia Jeddah', cr301_accountnumber: '777', cr301_ibannumber: 'SA77', _cr18c_bun_value: 'k2' },
  ],
  cr301_newofferdatasets: [
    { cr301_newofferdatasetid: 'o1', cr301_title: 'Knee MRI Offer', cr18c_offernamear: 'عرض رنين الركبة', _cr18c_bun_value: 'b1', _cr301_specialty_value: 's1', cr301_offertype: 1, cr301_originalprice: 2000, cr301_offerprice: 1500, cr301_offerdescription: '<p>Includes <strong>consultation</strong></p>', cr301_startdate: day(-10), cr301_enddate: day(3) },
    { cr301_newofferdatasetid: 'o2', cr301_title: 'Heart Checkup', cr18c_offernamear: 'فحص القلب', _cr18c_bun_value: 'b2', _cr301_specialty_value: 's2', cr301_offertype: 2, cr301_originalprice: 3000, cr301_offerprice: 2400, cr301_startdate: day(-30), cr301_enddate: day(40) },
    { cr301_newofferdatasetid: 'o3', cr301_title: 'Old Offer', _cr18c_bun_value: 'b3', _cr301_specialty_value: 's3', cr301_offertype: 2, cr301_startdate: day(-60), cr301_enddate: day(-3) },
  ],
  crd04_specialtieses: [{ crd04_specialtiesid: 'ks1', crd04_title: 'E.N.T' }, { crd04_specialtiesid: 'ks2', crd04_title: 'Dermatology' }],
  new_offertypes: [{ new_offertypeid: 't1', new_name: 'Seasonal' }, { new_offertypeid: 't2', new_name: 'Flash' }],
  new_offer_equests: [
    { new_offer_equestid: 'r1', new_name: 'ENT Package', new_offernamear: 'باقة الأنف والأذن', _new_bu_value: 'k1', _new_specialty_value: 'ks1', new_offertypef: 'Seasonal', new_new_totalserivep: 900, new_totalofferafterdiscf: 700, new_offerdescriptionar: 'يشمل الكشف والمنظار', new_startdatef: '01/09/2026', new_offerenddatef: day(20), new_offerstatusnew: 100000001 },
    { new_offer_equestid: 'r2', new_name: 'Skin Glow', _new_bu_value: 'k2', _new_specialty_value: 'ks2', new_offertypef: 'Flash', new_new_totalserivep: 500, new_totalofferafterdiscf: 350, new_startdatef: day(-5), new_offerenddatef: day(5), new_offerstatusnew: 100000001 },
  ],
  new_plannedoffers: [{ new_plannedofferid: 'p1', _new_originaloffer_value: 'r1', _new_type_value: 't1', new_startdatenew: day(15), new_enddatenew: day(45), new_totalservicespricebeforediscount: 950, new_totalofferafterdiscount: 650 }],
});

const EG = 983080000;
const SA = 983080001;
const choiceRow = (name: string, value: number, label: string) => ({ [name]: value, [`${name}${F}`]: label });
const doc = (entity: string, id: string, name: string, region: number, extra: DataverseRow = {}) => ({ [`${entity}id`]: id, cr18c_name: name, cr18c_iframeurl: `https://example.com/${id}`, cr18c_region: region, ...extra });
Object.assign(TABLES, {
  cr18c_servhubprograms: [
    { cr18c_servhubprogramid: 'pg1', cr18c_name: 'Healthy Heart', cr18c_programname: 'برنامج القلب', cr18c_programdescription: '<p>Full cardiac program</p>', cr18c_servicesincluded: '<ul><li>ECG</li><li>Echo</li></ul>', cr18c_noofservices: '5', cr18c_programlevel: 1, cr18c_pricebefore: '5000', cr18c_priceafter: '3900', _cr18c_bun_value: 'b2', _cr18c_specialty_value: 's2', cr18c_region: EG },
    { cr18c_servhubprogramid: 'pg2', cr18c_name: 'Knee Care', cr18c_programlevel: 3, _cr18c_bun_value: 'b1', _cr18c_specialty_value: 's1', cr18c_region: EG },
  ],
  cr18c_servhubhomecares: [
    { cr18c_servhubhomecareid: 'h1', cr18c_name: 'Home Care Guide', cr18c_iframeurl: 'https://example.com/guide.pdf', _cr18c_bu_value: 'b1' },
    { cr18c_servhubhomecareid: 'h2', cr18c_name: 'Nursing visit script', cr18c_script: '<p>أهلاً بحضرتك، الزيارة المنزلية متاحة يومياً.</p>', _cr18c_bu_value: 'b1', _cr18c_category_value: 'hc1', [`_cr18c_category_value${F}`]: 'Nursing', _cr18c_subcategory_value: 'hs1', [`_cr18c_subcategory_value${F}`]: 'Booking' },
  ],
  cr18c_servhubevents: [doc('cr18c_servhubevent', 'e1', 'Ramadan Event', SA)],
  cr18c_servhubinstallments: [doc('cr18c_servhubinstallment', 'i1', 'Tabby', SA)],
  cr18c_servhubspecialhandlings: [doc('cr18c_servhubspecialhandling', 'sh1', 'VIP Handling', SA)],
  cr18c_servhubsystemlinks: [{ cr18c_servhubsystemlinkid: 'sl1', cr18c_name: 'HIS', cr18c_systemlink: 'https://example.com/his', cr18c_region: EG }],
  cr18c_otherhealthinfos: [doc('cr18c_otherhealthinfo', 'oh1', 'Vaccination Schedule', EG)],
  cr18c_servhubcpgprotocols: [doc('cr18c_servhubcpgprotocol', 'cp1', 'Chest Pain Protocol', EG, { _cr18c_specialty_value: 's2' }), doc('cr18c_servhubcpgprotocol', 'cp2', 'ACL Rehab', EG, { _cr18c_specialty_value: 's1' })],
  cr18c_servhubcapexes: [doc('cr18c_servhubcapex', 'cx1', 'Robotic Arm', EG, { cr18c_devicestatus: 1, cr18c_descriptionen: 'Robotic knee replacement', cr18c_descriptionar: 'ذراع روبوتية', _cr18c_bun_value: 'b1', _cr18c_specialty_value: 's1' }), doc('cr18c_servhubcapex', 'cx2', 'MRI 3T', EG, { cr18c_devicestatus: 2, _cr18c_bun_value: 'b2' })],
  cr18c_servicehubinsurancecompanies: [
    { cr18c_servicehubinsurancecompanyid: 'in1', cr18c_companyname: 'Misr Insurance', ...choiceRow('cr18c_companytype', 3, 'تأمين'), ...choiceRow('cr18c_bu', 4, 'سموحه'), cr18c_uncoveredservice: 'الأسنان', cr18c_notes: 'موافقة مسبقة', cr18c_region: EG },
    { cr18c_servicehubinsurancecompanyid: 'in2', cr18c_companyname: 'CIB', ...choiceRow('cr18c_companytype', 2, 'بنوك'), ...choiceRow('cr18c_bu', 3, 'المعادي'), cr18c_region: EG },
  ],
  cr18c_servhubbookingpolicies: [{ cr18c_servhubbookingpolicyid: 'bp1', cr18c_name: 'ASH policy', cr18c_bookingpolicy: 'الحجز قبل 24 ساعة', cr18c_notes: 'خصم 10% للكاش', _cr18c_bun_value: 'b1', cr18c_region: EG }],
  cr18c_servhubqualityassurancetipses: [{ cr18c_servhubqualityassurancetipsid: 'qa1', cr18c_tipname: 'Greeting', cr18c_comment: 'Always greet by name', ...choiceRow('cr18c_service', 0, 'DCC'), _servhub_bun_value: 'b1', cr18c_region: EG }],
  cr18c_servhubcrmdictionaries: [{ cr18c_servhubcrmdictionaryid: 'cd1', cr18c_reason: 'Price concern', cr18c_type: 'Lost', ...choiceRow('cr18c_feedbackreason', 1, 'No Show / Lost Reason'), cr18c_region: EG }],
  cr18c_departmentworkinghourses: [{ cr18c_departmentworkinghoursid: 'wh1', cr18c_name: 'Lab', ...choiceRow('cr18c_department', 0, 'Laboratory'), ...choiceRow('cr18c_type', 0, 'Hospital'), cr18c_workinghours: '24/7', _cr18c_bun_value: 'b1', cr18c_region: EG }],
  cr301_categories: [{ cr301_categoryid: 'cat1', cr301_title: 'Appointments', cr18c_region: null }],
  cr301_subcategories: [{ cr301_subcategoryid: 'sub1', cr301_newcolumn: 'New booking', cr18c_region: null, _cr301_category_value: 'cat1' }],
  cr301_scriptses: [
    { cr301_scriptsid: 'sc1', cr301_newcolumn: 'Opening', cr301_script: '<p>صباح الخير، مستشفى أندلسية.</p>', cr301_order: 1, _cr301_category_value: 'cat1', _cr301_subcategory_value: 'sub1', _cr18c_bun_value: 'b1', cr18c_regionchoice: EG },
    { cr301_scriptsid: 'sc2', cr301_newcolumn: 'Closing', cr301_script: 'شكراً لاتصالك', cr301_order: 2, _cr301_category_value: 'cat1', _cr301_subcategory_value: 'sub1', _cr18c_bun_value: 'b2', cr18c_regionchoice: EG },
  ],
});

setPreviewPrivileges(ALLOW_ALL);
setPreviewGateway({
  list: async ({ entitySet, fetchXml }) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (entitySet === 'businessunits') {
      const region = /crd04_id" operator="eq" value="(\w+)"/.exec(fetchXml ?? '')?.[1];
      return { value: BUS.filter((row) => row.region === region) };
    }
    if (entitySet === 'cr301_ksaservicedatasets') {
      const xml = fetchXml ?? '';
      const isPackage = xml.includes('attribute="cr301_servicecategory" operator="eq" value="cat-pkg"');
      const bu = /attribute="cr18c_bu" operator="eq" value="([\w-]+)"/.exec(xml)?.[1];
      const search = /operator="like" value="%([^%]+)%"/.exec(xml)?.[1]?.toLowerCase();
      const page = Number(/page="(\d+)"/.exec(xml)?.[1] ?? 1);
      let rows = SERVICES.filter((row) => (row._cr301_servicecategory_value === 'cat-pkg') === isPackage);
      if (bu) rows = rows.filter((row) => row._cr18c_bu_value === bu);
      if (search) rows = rows.filter((row) => String(row.cr301_title).toLowerCase().includes(search) || String(row.cr301_code).toLowerCase().includes(search));
      if (xml.includes('attribute="servhub_priced" descending="true"')) rows = [...rows].sort((a, b) => Number(b.servhub_priced) - Number(a.servhub_priced));
      else if (xml.includes('attribute="servhub_priced"')) rows = [...rows].sort((a, b) => Number(a.servhub_priced) - Number(b.servhub_priced));
      const slice = rows.slice((page - 1) * 60, page * 60);
      return { value: slice, '@Microsoft.Dynamics.CRM.morerecords': page * 60 < rows.length, '@Microsoft.Dynamics.CRM.totalrecordcount': rows.length };
    }
    if (entitySet === 'cr301_detailsbybus') return { value: DETAILS_BY_BU.filter((row) => (fetchXml ?? '').includes(`value="${row._cr301_specialty_value}"`)) };
    if (entitySet === 'cr301_specialtydetails') return { value: (fetchXml ?? '').includes('value="s1"') ? SPECIALTY_DETAILS : [] };
    // Table pages: one system view for New Doctor Datasets; the last grid query is kept for tests.
    if (entitySet === 'savedqueries') {
      return {
        value: [
          {
            savedqueryid: 'v1',
            name: 'Active Doctors EGY',
            isdefault: true,
            fetchxml:
              '<fetch version="1.0" mapping="logical"><entity name="cr301_newdoctordataset"><attribute name="cr301_title" /><attribute name="servhub_doctornameen" /><attribute name="cr18c_exclusiveness" /><attribute name="cr301_specialty" /><attribute name="cr301_newdoctordatasetid" /><order attribute="cr301_title" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>',
            layoutxml:
              '<grid name="resultset" object="1" jump="cr301_title" select="1" icon="1" preview="1"><row name="result" id="cr301_newdoctordatasetid"><cell name="cr301_title" width="200" /><cell name="servhub_doctornameen" width="220" /><cell name="cr18c_exclusiveness" width="160" /><cell name="cr301_specialty" width="180" /></row></grid>',
          },
        ],
      };
    }
    if (entitySet === 'userqueries' || entitySet === 'systemforms') return { value: [] };
    if (entitySet === 'cr301_newdoctordatasets' && fetchXml) (window as unknown as { __lastFetch?: string }).__lastFetch = fetchXml;
    const regionValue = /attribute="cr18c_region(?:choice)?" operator="eq" value="(\d+)"/.exec(fetchXml ?? '')?.[1];
    const rows = TABLES[entitySet] ?? [];
    if (regionValue) return { value: rows.filter((row) => Number(row.cr18c_region ?? row.cr18c_regionchoice) === Number(regionValue)) };
    return { value: rows };
  },
  create: async () => undefined,
  update: async () => undefined,
  remove: async () => undefined,
  action: async () => ({}),
});
